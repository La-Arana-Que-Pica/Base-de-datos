'use strict';
// Presentation only. Coordinates, assignments and saved lineups belong to squad-builder.
(function(root) {
  const modes = ['classic', 'tactical', 'draft'];
  const normalize = mode => modes.includes(mode) ? mode : 'draft';
  const project = (mode, x, y, draft) => mode === 'draft' ? draft.projectField(x,y) : {x:6+x*.88,y:4+y*.9};
  const unproject = (mode, x, y, draft) => mode === 'draft' ? draft.unprojectField(x,y) : {x:(x-6)/.88,y:(y-4)/.9};
  // PES reference: yellow keepers, cyan defenders, green midfield, magenta attack.
  const tone = role => role === 'GK' ? '#ffe600' : ['CB','LB','RB'].includes(role) ? '#36c9f5' : ['DMF','CMF','LMF','RMF','AMF'].includes(role) ? '#79e329' : '#ff378e';
  // All languages, including Spanish, use the Database's shared position map.
  const positionLabel = (role, language, dictionary) => dictionary?.[role] || role || '—';
  function fieldPath(mode, points, draft) {
    if(mode === 'draft') return draft.fieldPath(points);
    return points.map(([x,y],i)=>{const p=project(mode,x,y);return (i?'L':'M')+p.x+' '+p.y;}).join(' ');
  }
  function pitchSurface(mode, draft) {
    if(mode === 'draft') return draft.pitchSurface();
    const line = points => fieldPath(mode,points);
    const bands=Array.from({length:10},(_,i)=>'<rect x="6" y="'+(4+i*9)+'" width="88" height="9" fill="'+(mode==='tactical'?(i%2?'#0b3b2c':'#0a382a'):(i%2?'#286125':'#225721'))+'"/>').join('');
    const lines=[[[6,4],[94,4],[94,94],[6,94],[6,4]],[[6,49],[94,49]],[[21.53,4],[21.53,18.14],[78.47,18.14],[78.47,4]],[[38.12,4],[38.12,8.71],[61.88,8.71],[61.88,4]],[[21.53,94],[21.53,79.86],[78.47,79.86],[78.47,94]],[[38.12,94],[38.12,89.29],[61.88,89.29],[61.88,94]]].map(points=>points.map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' ')).join(' ');
    return '<svg xmlns="http://www.w3.org/2000/svg" class="builder-draft-surface builder-flat-surface" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="100" rx="1" fill="'+(mode==='tactical'?'#082d25':'#19481f')+'"/>'+bands+(mode==='classic'?'<defs><filter id="builder-grass"><feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="2" stitchTiles="stitch"/></filter></defs><rect x="6" y="4" width="88" height="90" filter="url(#builder-grass)" opacity=".055"/>':'')+'<g fill="none" stroke="'+(mode==='tactical'?'#a7c7b5':'#c2db9b')+'" stroke-width=".32" opacity=".72"><path d="'+lines+'"/><ellipse cx="50" cy="49" rx="11.84" ry="7.84"/><path data-penalty-arcs="true" d="M40.53 18.14 A11.84 7.84 0 0 0 59.47 18.14 M40.53 79.86 A11.84 7.84 0 0 1 59.47 79.86"/>'+[ [6,4,0],[94,4,90],[94,94,180],[6,94,270] ].map(([x,y,a])=>'<path transform="translate('+x+' '+y+') rotate('+a+')" d="M1.3 0 A1.3 .86 0 0 1 0 .86"/>').join('')+'</g><g fill="#c2db9b">'+[49,13.43,84.57].map(y=>'<ellipse cx="50" cy="'+y+'" rx=".3" ry=".2"/>').join('')+'</g></svg>';
  }
  const api={modes,normalize,project,unproject,tone,positionLabel,fieldPath,pitchSurface};
  root.LAQPBuilderViews=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
