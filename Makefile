install-bun:
	curl -fsSL https://bun.sh/install | bash

install-noir:
	curl -L https://raw.githubusercontent.com/noir-lang/noirup/refs/heads/main/install | bash
	noirup --version 1.0.0-beta.3

install-barretenberg:
	curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/refs/heads/master/barretenberg/bbup/install | bash
	bbup --version 0.86.0-starknet.1

install-starknet:
	curl --proto '=https' --tlsv1.2 -sSf https://sh.starkup.dev | sh

install-devnet:
	asdf plugin add starknet-devnet
	asdf install starknet-devnet 0.4.1

install-garaga:
	pip install garaga==0.18.0

install-app-deps:
	cd app && bun install

devnet:
	starknet-devnet --accounts=2 --seed=0 --initial-balance=100000000000000000000000

accounts-file:
	curl -s http://localhost:5050/predeployed_accounts | jq '{"alpha-sepolia": {"devnet0": {address: .[0].address, private_key: .[0].private_key, public_key: .[0].public_key, class_hash: "0xe2eb8f5672af4e6a4e8a8f1b44989685e668489b0a25437733756c5a34a1d6", deployed: true, legacy: false, salt: "0x14", type: "open_zeppelin"}}}' > ./contracts/accounts.json

build-circuit:
	cd circuit && nargo build

exec-circuit:
	cd circuit && nargo execute witness

prove-circuit:
	bb prove --scheme ultra_honk --oracle_hash starknet -b ./circuit/target/circuit.json -w ./circuit/target/witness.gz -o ./circuit/target

gen-vk:
	bb write_vk --scheme ultra_honk --oracle_hash starknet -b ./circuit/target/circuit.json -o ./circuit/target

gen-verifier:
	cd contracts && garaga gen --system ultra_starknet_honk --vk ../circuit/target/vk --project-name verifier

build-contracts:
	cd contracts && scarb build

declare-verifier:
	cd contracts && sncast declare --package verifier --contract-name UltraStarknetHonkVerifier

deploy-verifier:
	# TODO: use class hash from the result of the `make declare-verifier` step
	cd contracts && sncast deploy --salt 0x02 --class-hash 0x00f6f3ddc546f498c67e3f8b107db4868f3666617be39e9cc27330a9fab552f9

declare-main:
	cd contracts && sncast declare --package main --contract-name MainContract

deploy-main:
	# TODO: use class hash from the result of the `make declare-main` step
	# NOTE: the public key is corresponding to the private key `1`
	cd contracts && sncast deploy --salt 0x02 --class-hash 0x056f532228046c147e24b058ae4b1b3ad1477cd859a614d08d2eee9aea844c32 --arguments 217234377348884654691879377518794323857294947151490278790710809376325639809

artifacts:
	cp ./circuit/target/circuit.json ./app/src/assets/circuit.json
	cp ./circuit/target/vk ./app/src/assets/vk.bin
	cp ./contracts/target/release/main_MainContract.contract_class.json ./app/src/assets/main.json

run-app:
	cd app && bun run dev

all:
	make build-circuit
	make gen-vk
	make gen-verifier
	make declare-verifier
	make artifacts
