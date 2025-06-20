.PHONY: build check clean fmt

clean:
	cargo clean

fmt:
	cargo +nightly fmt --all

fmt-check:
	cargo +nightly fmt --all -- --check

check:
	cargo clippy --all-features --locked -- -D warnings

build:
	cargo build --target wasm32-wasip1 --profile release-wasm
	which wasm-strip && wasm-strip target/wasm32-wasip1/release-wasm/oracle-program.wasm || true
	which wasm-opt && wasm-opt -Oz --enable-bulk-memory target/wasm32-wasip1/release-wasm/oracle-program.wasm -o target/wasm32-wasip1/release-wasm/oracle-program.wasm || true

install-tools:
	bun install