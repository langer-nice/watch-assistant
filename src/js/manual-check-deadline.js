// Bound the request, not just the spinner. Late responses cannot pass this
// await into local result persistence; an abort also stops pending fetch reads.
export const boundedManualCheckRequest = (work, timeoutMs = 30000) => {
 const controller=new AbortController();let timer;
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{
  reject(Object.assign(new Error('Check completion could not be confirmed in time.'),{code:'TIMEOUT'}));
  controller.abort();
 },timeoutMs);});
 return Promise.race([Promise.resolve().then(()=>work(controller.signal)),timeout]).finally(()=>clearTimeout(timer));
};
