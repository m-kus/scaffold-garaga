export enum ProofState {
  Initial = 'Initial',
  GeneratingWitness = 'Generating witness',
  GeneratingProof = 'Generating proof',
  PreparingCalldata = 'Preparing calldata',
  ConnectingWallet = 'Connecting wallet',
  SendingTransaction = 'Sending transaction',
  ProofVerified = 'Proof is verified',
  Error = 'Error'
}

export interface ProofStateData {
  state: ProofState;
  error?: string;
  errorAt?: ProofState;
}
