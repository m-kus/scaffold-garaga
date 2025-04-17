import { useState, useEffect, useRef } from 'react'
import './App.css'
import { ProofState, ProofStateData } from './types'
import { Noir } from "@noir-lang/noir_js";
import { UltraHonkBackend } from "@aztec/bb.js";
import { flattenFieldsAsArray } from "./helpers/proof";
import { getHonkCallData, init, poseidonHashBN254 } from 'garaga';
import { bytecode, abi } from "./assets/circuit.json";
import { abi as verifierAbi } from "./assets/verifier.json";
import vkUrl from './assets/vk.bin?url';
import { RpcProvider, Contract } from 'starknet';
import initNoirC from "@noir-lang/noirc_abi";
import initACVM from "@noir-lang/acvm_js";
import acvm from "@noir-lang/acvm_js/web/acvm_js_bg.wasm?url";
import noirc from "@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url";

function App() {
  const [proofState, setProofState] = useState<ProofStateData>({
    state: ProofState.Initial
  });
  const [vk, setVk] = useState<Uint8Array | null>(null);
  // Use a ref to reliably track the current state across asynchronous operations
  const currentStateRef = useRef<ProofState>(ProofState.Initial);
  const [secretKey, setSecretKey] = useState<number>(1);
  const [inputValue, setInputValue] = useState<number>(9);

  // Initialize WASM on component mount
  useEffect(() => {
    const initWasm = async () => {
      try {
        // This might have already been initialized in main.tsx,
        // but we're adding it here as a fallback
        if (typeof window !== 'undefined') {
          await Promise.all([initACVM(fetch(acvm)), initNoirC(fetch(noirc))]);
          console.log('WASM initialization in App component complete');
        }
      } catch (error) {
        console.error('Failed to initialize WASM in App component:', error);
      }
    };

    const loadVk = async () => {
      const response = await fetch(vkUrl);
      const arrayBuffer = await response.arrayBuffer();
      const binaryData = new Uint8Array(arrayBuffer);
      setVk(binaryData);
      console.log('Loaded verifying key:', binaryData);
    };
    
    initWasm();
    loadVk();
  }, []);

  const resetState = () => {
    currentStateRef.current = ProofState.Initial;
    setProofState({ 
      state: ProofState.Initial,
      error: undefined 
    });
  };

  const handleError = (error: unknown) => {
    console.error('Error:', error);
    let errorMessage: string;
    
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (error !== null && error !== undefined) {
      // Try to convert any non-Error object to a string
      try {
        errorMessage = String(error);
      } catch {
        errorMessage = 'Unknown error (non-stringifiable object)';
      }
    } else {
      errorMessage = 'Unknown error occurred';
    }
    
    // Use the ref to get the most recent state
    setProofState({
      state: currentStateRef.current,
      error: errorMessage
    });
  };

  const updateState = (newState: ProofState) => {
    currentStateRef.current = newState;
    setProofState({ state: newState, error: undefined });
  };

  const startProcess = async () => {
    try {
      // Start the process
      updateState(ProofState.GeneratingWitness);
      
      await init();

      // Use input values from state
      const inputs = {
        secret_key: secretKey,
        input: inputValue,
        public_key: poseidonHashBN254(BigInt(secretKey), BigInt(secretKey)).toString(),
        nullifier: poseidonHashBN254(BigInt(secretKey), BigInt(inputValue)).toString()
      };

      // Generate witness
      let noir = new Noir({ bytecode, abi: abi as any });
      let execResult = await noir.execute(inputs);
      console.log(execResult);
      
      // Generate proof
      updateState(ProofState.GeneratingProof);

      let honk = new UltraHonkBackend(bytecode, { threads: 2 });
      let proof = await honk.generateProof(execResult.witness, { keccak: true });
      honk.destroy();
      console.log(proof);
      
      // Prepare calldata
      updateState(ProofState.PreparingCalldata);

      const callData = getHonkCallData(
        proof.proof,
        flattenFieldsAsArray(proof.publicInputs),
        vk as Uint8Array,
        0 // HonkFlavor.KECCAK
      );
      console.log(callData);
      
      // Connect wallet
      updateState(ProofState.ConnectingWallet);

      // Send transaction
      updateState(ProofState.SendingTransaction);

      const provider = new RpcProvider({ nodeUrl: 'http://127.0.0.1:5050/rpc' });
      // TODO: use conract address from the result of the `make deploy-verifier` step
      const contractAddress = '0x07b7108d835db423ec3883bb3934250ff0a2068b6969f95f40be623cfed3b931';
      const verifierContract = new Contract(verifierAbi, contractAddress, provider);
      
      // Check verification
      const res = await verifierContract.verify_ultra_keccak_honk_proof(callData.slice(1));
      console.log(res);

      updateState(ProofState.ProofVerified);
    } catch (error) {
      handleError(error);
    }
  };

  const renderStateIndicator = (state: ProofState, current: ProofState) => {
    let status = 'pending';
    
    // If this stage is current with an error, show error state
    if (current === state && proofState.error) {
      status = 'error';
    } 
    // If this is the current stage, show active state
    else if (current === state) {
      status = 'active';
    } 
    // If we're past this stage, mark it completed
    else if (getStateIndex(current) > getStateIndex(state)) {
      status = 'completed';
    }
    
    return (
      <div className={`state-indicator ${status}`}>
        <div className="state-dot"></div>
        <div className="state-label">{state}</div>
      </div>
    );
  };

  const getStateIndex = (state: ProofState): number => {
    const states = [
      ProofState.Initial,
      ProofState.GeneratingWitness,
      ProofState.GeneratingProof,
      ProofState.PreparingCalldata,
      ProofState.ConnectingWallet,
      ProofState.SendingTransaction,
      ProofState.ProofVerified
    ];
    
    return states.indexOf(state);
  };

  return (
    <div className="container">
      <h1>Noir Proof Generation & Starknet Verification</h1>
      
      <div className="state-machine">
        <div className="input-section">
          <div className="input-group">
            <label htmlFor="secret-key">Secret Key:</label>
            <input 
              id="secret-key"
              type="text" 
              value={secretKey} 
              onChange={(e) => setSecretKey(parseInt(e.target.value) || 0)} 
              min="0"
              disabled={proofState.state !== ProofState.Initial}
            />
          </div>
          <div className="input-group">
            <label htmlFor="input-value">Input:</label>
            <input 
              id="input-value"
              type="text" 
              value={inputValue} 
              onChange={(e) => setInputValue(parseInt(e.target.value) || 0)} 
              min="0"
              disabled={proofState.state !== ProofState.Initial}
            />
          </div>
        </div>
        
        {renderStateIndicator(ProofState.GeneratingWitness, proofState.state)}
        {renderStateIndicator(ProofState.GeneratingProof, proofState.state)}
        {renderStateIndicator(ProofState.PreparingCalldata, proofState.state)}
        {renderStateIndicator(ProofState.ConnectingWallet, proofState.state)}
        {renderStateIndicator(ProofState.SendingTransaction, proofState.state)}
      </div>
      
      {proofState.error && (
        <div className="error-message">
          Error at stage '{proofState.state}': {proofState.error}
        </div>
      )}
      
      <div className="controls">
        {proofState.state === ProofState.Initial && !proofState.error && (
          <button className="primary-button" onClick={startProcess}>Start</button>
        )}
        
        {(proofState.error || proofState.state === ProofState.ProofVerified) && (
          <button className="reset-button" onClick={resetState}>Reset</button>
        )}
      </div>
    </div>
  )
}

export default App
