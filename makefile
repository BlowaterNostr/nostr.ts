test:
	rm -rf cov_profile*
	deno test --allow-net --trace-ops --coverage=cov_profile *.test.ts

# https://deno.com/manual@main/basics/testing/coverage
cov:
	deno coverage cov_profile --lcov --output=cov_profile.lcov
	genhtml --ignore-errors unmapped -o cov_profile/html cov_profile.lcov
	file_server -p 4508 cov_profile/html

fmt:
	deno fmt --options-indent-width 4 --options-line-width 110 --ignore=cov_profile

fmt-check:
	deno fmt  --check --options-indent-width 4 --options-line-width 110

check: fmt-check
	deno compile cli/nostr.ts

install:
	deno install --allow-net --allow-read https://deno.land/std@0.202.0/http/file_server.ts
