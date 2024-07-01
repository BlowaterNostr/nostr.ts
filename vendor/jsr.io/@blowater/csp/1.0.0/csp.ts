/** used when code should not be reachable */
export class UnreachableError extends Error {
    constructor(msg: string) {
        super(msg);
        this.name = UnreachableError.name;
    }
}

/** one possible return value of `put` */
export class PutToClosedChannelError extends Error {
    constructor() {
        super();
        this.name = "PutToClosedChannelError";
    }
}

/** possibly thrown by `close` */
export class CloseChannelTwiceError extends Error {}

/**
 * 2 base methods that all kinds of channels have to implement.
 */
interface base {
    // Close this channel. This method does not block and returns immediately.
    // One might argue that if a IO like object implement this interface,
    // its close behavior might need to block.
    // If this situation is indeed encounterred. Please raise an issue on GitHub and let's discuss it.
    close(): Promise<void>;
    // Check if this channel is closed.
    closed(): boolean | string;
}

/** A symbol that indicates the channel has been closed and no further data to be read */
export const closed = Symbol("closed");

/** One can only receive data from a PopChannel. */
export interface PopChannel<T> extends base {
    /** Receive data from this channel. */
    pop(): Promise<T | typeof closed>;
}

/** One can only send data to a PutChannel. */
export interface PutChannel<T> extends base {
    /** Send data to this channel. */
    put(ele: T): Promise<Error | void>;
}

/**
 * Normally a channel can both pop/receive and be put/send data.
 * The documentation will use pop/receive and put/send interchangeably.
 */
export interface BaseChannel<T> extends PopChannel<T>, PutChannel<T> {}

/**
 * A SelectableChannel implements the `ready` method that will be used by the `select` function.
 */
export interface SeletableChannel<T> extends PopChannel<T> {
    ready(): Promise<SeletableChannel<T>>;
}

interface PopperOnResolver<T> {
    (ele: { value: typeof closed; done: true } | { value: T; done: false }): void;
}

/**
 * The full channel implementation
 */
export class Channel<T> implements SeletableChannel<T>, PutChannel<T>, AsyncIterableIterator<T> {
    private _closed: boolean = false;
    private close_reason: string = "";

    private popActions: PopperOnResolver<T>[] = [];

    private readonly putActions: Array<{ resolve: Function; reject: Function; ele: T }> = [];

    private readyListener: { resolve: Function; i: Channel<T> }[] = [];

    private readonly buffer: T[] = [];

    constructor(private bufferSize: number = 0) {}

    async put(ele: T): Promise<PutToClosedChannelError | void> {
        if (this._closed) {
            return new PutToClosedChannelError();
        }

        if (this.readyListener.length > 0) {
            for (let { resolve, i } of this.readyListener) {
                resolve(i);
            }
            this.readyListener = [];
        }

        // if no pop action awaiting
        if (this.popActions.length === 0) {
            return new Promise((resolve, reject) => {
                if (this.buffer.length < this.bufferSize) {
                    this.buffer.push(ele);
                    resolve();
                } else {
                    this.putActions.push({ resolve, reject, ele });
                }
            });
        } else {
            return new Promise((resolve) => {
                let onPop = this.popActions.shift();
                if (onPop === undefined) {
                    throw new UnreachableError("should have a pending pop action");
                }
                if (this.buffer.length > 0) {
                    let firstInBuffer = this.buffer.shift();
                    if (firstInBuffer === undefined) {
                        throw new UnreachableError("should have a buffered ele");
                    }
                    onPop({ value: firstInBuffer, done: false });
                    this.buffer.push(ele);
                } else {
                    onPop({ value: ele, done: false });
                }
                resolve();
            });
        }
    }

    // checks if a channel is ready to be read but dooes not read it
    // it returns only after the channel is ready
    async ready(): Promise<Channel<T>> {
        if (this.isReadyToPop()) {
            await sleep(0);
            return this;
        } else {
            return new Promise((resolve) => {
                this.readyListener.push({ resolve, i: this });
            });
        }
    }

    isReadyToPop(): boolean {
        return this.putActions.length > 0 || this._closed || this.buffer.length > 0;
    }

    async pop(): Promise<T | typeof closed> {
        let next = await this.next();
        return next.value;
    }

    next(): Promise<
        { value: T; done: false } | { value: typeof closed; done: true }
    > {
        if (this._closed && this.buffer.length == 0) {
            return Promise.resolve({ value: closed, done: true });
        }

        if (this.putActions.length === 0) {
            return new Promise((resolve, reject) => {
                if (this.buffer.length > 0) {
                    let firstInBuffer = this.buffer.shift() as T;
                    resolve({ value: firstInBuffer, done: false });
                } else {
                    this.popActions.push(resolve);
                }
            });
        } else {
            return new Promise((resolve) => {
                let putAction = this.putActions.shift();
                if (putAction === undefined) {
                    throw new UnreachableError("should have a pending put action");
                }
                let { resolve: resolvePut, ele } = putAction;
                if (this.buffer.length > 0) {
                    let firstInBuffer = this.buffer.shift() as T;
                    this.buffer.push(ele);
                    resolvePut();
                    resolve({ value: firstInBuffer, done: false });
                } else {
                    resolvePut();
                    resolve({ value: ele, done: false });
                }
            });
        }
    }

    /**
     * `put` to a closed channel returns a `PutToClosedChannelError`
     *
     * `pop` from a closed channel returns the `closed` symbol
     *
     * `close` a closed channel throws a `CloseChannelTwiceError`
     */
    async close(reason?: string): Promise<void> {
        if (this._closed) {
            throw new CloseChannelTwiceError();
        }
        // A closed channel always pops { value: undefined, done: true }
        for (let pendingPopper of this.popActions) {
            pendingPopper({ value: closed, done: true });
        }
        this.popActions = [];
        // A closed channel is always ready to be popped.
        for (let { resolve, i } of this.readyListener) {
            resolve(i);
        }
        this.readyListener = [];

        for (let pendingPutter of this.putActions) {
            let e = new PutToClosedChannelError();
            pendingPutter.resolve(e);
        }
        this._closed = true;
        if (reason) {
            this.close_reason = reason;
        }
    }

    closed(): boolean | string {
        return this.close_reason || this._closed;
    }

    [Symbol.asyncIterator](): typeof this {
        return this;
    }
}

/** short hand for `new Channel()` */
export function chan<T>(bufferSize: number = 0): Channel<T> {
    return new Channel<T>(bufferSize);
}

interface onSelect<T, R> {
    (ele: T | undefined): Promise<R>;
}

interface DefaultCase<T> {
    (): Promise<T>;
}

/**
 * `select` is modelled after Go's select statement ( https://tour.golang.org/concurrency/5 )
 * and does the same thing and should have identical behavior.
 *
 * https://stackoverflow.com/questions/37021194/how-are-golang-select-statements-implemented
 */
export async function select<Result>(
    channels: [SeletableChannel<any>, onSelect<any, Result>][],
    defaultCase?: DefaultCase<Result>,
): Promise<Result> {
    let promises: Promise<number>[] = channels.map(async ([c, func], i) => {
        await c.ready();
        return i;
    });
    if (defaultCase) {
        promises = promises.concat([
            new Promise((resolve) => {
                // Run it in the next tick of the event loop to prevent starvation.
                // Otherwise, if used in an infinite loop, select might always go to the default case.
                setTimeout(() => {
                    resolve(promises.length - 1);
                }, 0);
            }),
        ]);
    }
    let i = await Promise.race(promises);
    if (defaultCase && i === promises.length - 1) {
        return await defaultCase();
    }
    let ele = await channels[i][0].pop();
    return await channels[i][1](ele);
}

const MAX_INT_32 = Math.pow(2, 32) / 2 - 1;

/** the return value of `sleep` if it is not cancelled */
export const not_cancelled: Symbol = Symbol();
/**
 * A promised setTimeout.
 * @param ms Time to sleep
 * @param cancel When this promise is resolved, the `sleep` will be cancelled
 */
export function sleep<T = never>(ms: number, cancel?: Promise<T>): Promise<T | Symbol> {
    if (0 > ms || ms > MAX_INT_32) {
        throw Error(`${ms} is out of signed int32 bound or is negative`);
    }
    return new Promise<T | typeof not_cancelled>((resolve, _) => {
        let timeoutID = setTimeout(() => {
            resolve(not_cancelled); // is not cancelled
        }, ms);
        if (cancel) {
            cancel.then((res) => {
                clearTimeout(timeoutID);
                resolve(res); // is cancelled
            });
        }
    });
}

/**
 * Casting/duplicating values from one source channel to multiple destination channels
 */
export class Multicaster<T> {
    public listeners: Channel<T>[] = [];
    constructor(public source: Channel<T>) {
        (async () => {
            while (true) {
                if (source.closed()) {
                    for (let l of this.listeners) {
                        l.close();
                    }
                    return;
                }
                let data = await source.pop();
                if (data === closed) {
                    for (let l of this.listeners) {
                        l.close();
                    }
                    return;
                }
                for (let l of this.listeners) {
                    if (l.closed()) {
                        continue;
                    }
                    l.put(data);
                }
            }
        })();
    }

    copy(): Channel<T> {
        let c = new Channel<T>();
        this.listeners.push(c);
        return c;
    }
}

/** short hand for `new Multicaster()` */
export function multi<T>(c: Channel<T>): Multicaster<T> {
    return new Multicaster(c);
}

/** a channel based semaphore implementation */
export function semaphore(n: number): <T>(lambda: () => T) => Promise<T> {
    const c = chan<void>(n);
    return async <T>(lambda: () => T) => {
        await c.put();
        const r = await lambda();
        await c.pop();
        return r;
    };
}

/** merge multiple channels into one */
export function merge<T>(...iters: Channel<T>[]): Channel<T> {
    let merged = chan<T>();
    async function coroutine<T>(source: Channel<T>, destination: Channel<T>) {
        for await (let ele of source) {
            if (destination.closed()) {
                return;
            }
            let err = await destination.put(ele);
            if (err instanceof PutToClosedChannelError) {
                // this means the merged channel was not closed when
                // destination.closed() is called,
                // but during waiting time of destination.closed(), no consumer pops it and it was closed.
                // This is normal semantics of channels
                // so that it's fine to not throw it up to the call stack
                // but then this ele has already been popped from the iter,
                // it will be lost.
                let err2 = await source.put(ele);
                if (err2 instanceof PutToClosedChannelError) {
                    // if the source has been closed at this time, we can't do anything about it.
                    // ele is forever lost
                    // this situation should be rare in a program
                    throw new Error(
                        `both source and destination channel has been closed, ${ele} is lost`,
                    );
                }
                return;
            }
        }
    }
    for (let iter of iters) {
        coroutine(iter, merged);
    }
    return merged;
}
