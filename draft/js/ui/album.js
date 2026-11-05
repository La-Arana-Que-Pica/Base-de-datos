import {openCollection} from './collection.js';
// Keep the existing entry point; both tabs now share the main presentation surface.
export function openAlbum(state){return openCollection(state,{tab:'cards'});}
