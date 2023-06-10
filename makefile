test:
	deno test --allow-net --trace-ops

fmt:
	deno fmt --options-indent-width 4 --options-line-width 110

fmt-check:
	deno fmt  --check --options-indent-width 4 --options-line-width 110
