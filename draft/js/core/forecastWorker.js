import {estimateQualification} from './preMatchAnalysis.js';
self.onmessage=event=>{try{self.postMessage({ok:true,result:estimateQualification(event.data)});}catch{self.postMessage({ok:false});}};
