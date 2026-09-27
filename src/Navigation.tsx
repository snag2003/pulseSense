import {useState} from 'react';
export type Section='camera'|'photos'|'dashboard'|'vitals'|'symptom'|'voice'|'records'|'privacy'|'wearables'|'brief'|'controls'|'analytics'|'display';
export const sections:Record<Section,{label:string;description:string}>={
 dashboard:{label:'Home',description:'Your health, in one place.'},
 symptom:{label:'How I feel',description:'Describe a concern and get help preparing questions.'},
 vitals:{label:'Add a reading',description:'Record a measurement from a device you trust.'},
 camera:{label:'Camera check-in',description:'Try an experimental pulse estimate.'},
 photos:{label:'Track a photo',description:'Keep a visual journal of changes.'},
 records:{label:'My journal',description:'Review, filter and download your saved records.'},
 analytics:{label:'My trends',description:'Explore measurements over time.'},
 wearables:{label:'My devices',description:'Connect Oura or import Apple Watch readings.'},
 brief:{label:'Appointment brief',description:'Turn selected readings into questions and a summary.'},
 voice:{label:'Listen & review',description:'Hear information at a comfortable pace.'},
 privacy:{label:'Privacy & sharing',description:'Choose what goes to each AI service.'},
 controls:{label:'AI activity',description:'Review your recent AI requests.'},
 display:{label:'Reading preferences',description:'Make the app easier to read and navigate.'}
};
export const groups:{id:string;label:string;icon:string;home:Section;sections:Section[]}[]=[
 {id:'home',label:'Home',icon:'⌂',home:'dashboard',sections:['dashboard']},
 {id:'check-in',label:'Check in',icon:'♡',home:'symptom',sections:['symptom','vitals','photos','camera']},
 {id:'health',label:'My health',icon:'▤',home:'records',sections:['records','analytics','wearables']},
 {id:'visit',label:'Prepare for a visit',icon:'▧',home:'brief',sections:['brief','voice']},
 {id:'settings',label:'Settings',icon:'⚙',home:'privacy',sections:['privacy','controls','display']}
];
export function initialSection():Section{const hash=location.hash.slice(1);return Object.prototype.hasOwnProperty.call(sections,hash)?hash as Section:new URLSearchParams(location.search).has('wearable')?'wearables':'dashboard';}
export function StartHere({onNav}:{onNav:(section:Section)=>void}){return <section className="start-here" aria-labelledby="start-here-title"><div className="section-line"><h2 id="start-here-title">What would you like to do?</h2><span className="small">Start wherever you feel comfortable.</span></div><div className="task-grid">{([
 ['symptom','✧','Talk through a concern','Describe how you feel and get educational guidance.'],
 ['vitals','♡','Save a reading','Add a measurement manually. No wearable needed.'],
 ['photos','▧','Track a change','Keep dated photos and notes together.'],
 ['brief','↗','Get ready for a visit','Create a summary and questions you can take with you.']
] as const).map(([id,icon,title,detail])=><button className="task-card" key={id} onClick={()=>onNav(id)}><span className="task-icon" aria-hidden="true">{icon}</span><strong>{title}</strong><span>{detail}</span><b aria-hidden="true">→</b></button>)}</div><p className="small">For your own health tracking. AI can help organize information and explain it, but it cannot diagnose or contact a clinician.</p></section>;}
export type Preferences={largeText:boolean;contrast:boolean;reduceMotion:boolean};
export function readPreferences():Preferences{try{const d=JSON.parse(localStorage.getItem('pulse-display')||'{}');return {largeText:d.largeText===true,contrast:d.contrast===true,reduceMotion:d.reduceMotion===true};}catch{return {largeText:false,contrast:false,reduceMotion:false};}}
export function ReadingPreferences({value,onChange}:{value:Preferences;onChange:(value:Preferences)=>void}){const [saved,setSaved]=useState('');return <><div className="vision-heading"><span className="eyebrow">MAKE YOURSELF COMFORTABLE</span><h1>Reading preferences</h1><p>Choose the view that works for you. Changes apply right away on this browser.</p></div><section className="panel preference-panel">{([
 ['largeText','Larger text','Increase everyday text and button sizes.'],
 ['contrast','Higher contrast','Make supporting text and controls easier to see.'],
 ['reduceMotion','Less motion','Turn off decorative animation and transitions.']
] as const).map(([key,title,description])=><label className="preference-row" key={key}><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" checked={value[key]} onChange={e=>{onChange({...value,[key]:e.target.checked});setSaved('View updated.');}}/></label>)}<p role="status" className="small">{saved}</p><p className="small">You can use a keyboard throughout the app. Voice playback is available in Prepare for a visit; optional dictation is in photo notes. These preferences stay on this browser and do not send health information anywhere.</p></section></>;}
