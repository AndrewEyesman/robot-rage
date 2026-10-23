FROM rust:1-bookworm
RUN rustup target add wasm32-unknown-unknown && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y -qq nodejs && \
    cargo install wasm-pack --locked
WORKDIR /src
