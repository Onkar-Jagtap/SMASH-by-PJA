/// <reference lib="webworker" />
import { runEngine, caches } from './engine';

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;
  
  if (type === 'run') {
     const { inputList, suppList, authPayload } = payload;
     try {
       const res = await runEngine(inputList, suppList, authPayload, (percent, text, liveStr, tokenConsumed) => {
          self.postMessage({ type: 'progress', percent, text, liveStr, tokenConsumed });
       });
       self.postMessage({ type: 'done', results: res });
     } catch (err: any) {
       self.postMessage({ type: 'error', error: err.message });
     }
  }
};
