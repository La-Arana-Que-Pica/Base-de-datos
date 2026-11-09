import {createService} from './service.mjs';
Deno.serve(createService((name:string)=>Deno.env.get(name)));
