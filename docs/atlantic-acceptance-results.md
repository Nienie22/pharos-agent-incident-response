# Atlantic Acceptance Results

- Network: `pharos-atlantic`
- Chain ID: `688689`
- RPC: `https://atlantic.dplabs-internal.com`
- Explorer: `https://atlantic.pharosscan.xyz`
- Ran at: `2026-06-15T09:28:17.580Z`

## Contracts
- `IncidentRegistry`: `0x0d93b5cD4356652ef6b4776949A86979e9c00cdE`
- `EmergencyPolicyController`: `0xA2F7fEED38f72eF63ACa52696C1620a3e2EecE2d`
- `AgentRegistry`: `0x2d1B360dec14e63846735939E793bcb1655Aa93b`

## Roles (caller addresses)
- reporter: `0x9A34cCe75AB21a76f8Abf455C436146F6Ac4821d`
- approver1: `0xA98D4506B63518491e1B2D9A7d2fF6C0fE10bF71`
- approver2: `0x3B379b41aAAdE771036CF63652B9EBC58cF3b024`
- responder: `0x3DAe47dA93e715756582fa125daCcb785D095Ddf`

## Bytecode verification
- IncidentRegistry: MATCH (local `0x23ab365b9e84d1ab662d18e408a0933046229a21949dca7191b655c6ce90250e` vs onchain `0x23ab365b9e84d1ab662d18e408a0933046229a21949dca7191b655c6ce90250e`)
- EmergencyPolicyController: MATCH (local `0x2d6b1069f598be7b44792cf660ace8c95d0434dc7a2628e8de905b744e8dee9a` vs onchain `0x2d6b1069f598be7b44792cf660ace8c95d0434dc7a2628e8de905b744e8dee9a`)

## Role verification
- reporter_is_REPORTER_on_Registry: GRANTED
- responder_is_EXECUTOR_on_Registry: GRANTED
- approver1_is_APPROVER_on_Controller: GRANTED
- approver2_is_APPROVER_on_Controller: GRANTED
- responder_is_EXECUTOR_on_Controller: GRANTED

## Relationship verification
- controller.agentRegistry = `0x2d1B360dec14e63846735939E793bcb1655Aa93b` matches `0x2d1B360dec14e63846735939E793bcb1655Aa93b`: true
- controller.incidentRegistry = `0x0d93b5cD4356652ef6b4776949A86979e9c00cdE` matches `0x0d93b5cD4356652ef6b4776949A86979e9c00cdE`: true

## Scenarios
### S1: Malicious approval detection
- Watcher observes GoPlus-flagged approval; incident registered on chain.
- Result: PASS
- Transaction: `0x56eed9d111add0c08f8a63267b1433d6d624aeec6da512afd4732d6cdd84bf5d` (block `24242493`) - https://atlantic.pharosscan.xyz/tx/0x56eed9d111add0c08f8a63267b1433d6d624aeec6da512afd4732d6cdd84bf5d

### S2: Approved revoke (SNAPSHOT, CRITICAL)
- Plan with two CRITICAL approvals recorded on chain.
- Result: PASS
- Transaction 1: `0x878bfaee80ae4f42d25574a29b1e6505b34c9ffec5abd167062260a982dc4e21` (block `24242497`) - https://atlantic.pharosscan.xyz/tx/0x878bfaee80ae4f42d25574a29b1e6505b34c9ffec5abd167062260a982dc4e21
- Transaction 2: `0xf5606c82ddea025edfa5eca655a72a4a4eb19543598d82bda2963d576638605f` (block `24242500`) - https://atlantic.pharosscan.xyz/tx/0xf5606c82ddea025edfa5eca655a72a4a4eb19543598d82bda2963d576638605f
- Transaction 3: `0xa6a73c8f4e40bfaf10ebc482b9686ff98355db93f465ef6beafe3245c3af8c32` (block `24242505`) - https://atlantic.pharosscan.xyz/tx/0xa6a73c8f4e40bfaf10ebc482b9686ff98355db93f465ef6beafe3245c3af8c32

### S3: Agent pause
- PAUSE_AGENT plan approved and executed; agent registry flips paused flag.
- Result: PASS
- Transaction 1: `0x777771edc189018695b635089bf092e90af02e6d37f8782f11d2eb4a66de2a28` (block `24242510`) - https://atlantic.pharosscan.xyz/tx/0x777771edc189018695b635089bf092e90af02e6d37f8782f11d2eb4a66de2a28
- Transaction 2: `0x68635491b38bf60f45eb227dda8a666b2d3c783f9f4826c276a8e965b664a93b` (block `24242515`) - https://atlantic.pharosscan.xyz/tx/0x68635491b38bf60f45eb227dda8a666b2d3c783f9f4826c276a8e965b664a93b
- Transaction 3: `0x45c6c06d8897da9cc0738d437778676d4fcd171ecb5d8d15f48a551eb1d02502` (block `24242520`) - https://atlantic.pharosscan.xyz/tx/0x45c6c06d8897da9cc0738d437778676d4fcd171ecb5d8d15f48a551eb1d02502

### S4: Rejected unauthorized action
- Non-EXECUTOR caller attempts execute() and is rejected by AccessControl.
- Result: PASS
- Notes: `reverted as expected`

### S5: Verified closure
- Closure receipt anchored on IncidentRegistry.
- Result: PASS
- Transaction 1: `0x65c688bd3f139a3396bc46cd9996d950d40822653bd0557250a79ef34217a2d6` (block `24242528`) - https://atlantic.pharosscan.xyz/tx/0x65c688bd3f139a3396bc46cd9996d950d40822653bd0557250a79ef34217a2d6
- Transaction 2: `0x2bcb475f1b342af0d0fa3653ef1e5ac27cf557cc1e2c2e4b406b5c574755959d` (block `24242532`) - https://atlantic.pharosscan.xyz/tx/0x2bcb475f1b342af0d0fa3653ef1e5ac27cf557cc1e2c2e4b406b5c574755959d
- Closure hash: `0xce685d12e6a77302398cc6e885be687a942ac1c08bfd7ca7a9759270a2375d38`

## Setup transactions
- reporter: `0x5137e09c0957b78e448d871808143f9de0d1619cffa4d267951f40553c42045a` (block `24242471`) - https://atlantic.pharosscan.xyz/tx/0x5137e09c0957b78e448d871808143f9de0d1619cffa4d267951f40553c42045a
- executor_registry: `0xfa3256a407ea4893878ca576a89953fa32f37e6e9c192c668985ef4483b77fe0` (block `24242475`) - https://atlantic.pharosscan.xyz/tx/0xfa3256a407ea4893878ca576a89953fa32f37e6e9c192c668985ef4483b77fe0
- approver1: `0x4d2a4d4afb148411dfa12c9211b08844c7f31a49b7277f42655cf81f896198b7` (block `24242480`) - https://atlantic.pharosscan.xyz/tx/0x4d2a4d4afb148411dfa12c9211b08844c7f31a49b7277f42655cf81f896198b7
- approver2: `0xba3f13db24f06bd2a7ddf16bb51c1c0a8dfe24ea80797fbd8967f7932c44c63e` (block `24242484`) - https://atlantic.pharosscan.xyz/tx/0xba3f13db24f06bd2a7ddf16bb51c1c0a8dfe24ea80797fbd8967f7932c44c63e
- executor_controller: `0x9a7a9d74fda50f8e04c546c655236e2808be385ebf91775032b9ca2c009b5120` (block `24242488`) - https://atlantic.pharosscan.xyz/tx/0x9a7a9d74fda50f8e04c546c655236e2808be385ebf91775032b9ca2c009b5120

## Sanitized manifest

See `deployments/atlantic.public.json` for the redacted deployment manifest (no private keys, no mnemonics).
