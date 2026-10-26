export const SUCCESS='success', FAILURE='failure', RUNNING='running';

export class Node {
 constructor(name){this.name=name;this.status=null;}
 tick(context){const status=this.update(context);if(![SUCCESS,FAILURE,RUNNING].includes(status))throw new Error(`${this.name}: invalid behavior status`);this.status=status;context.trace?.push({name:this.name,status});return status;}
 reset(context){this.status=null;}
}
export class Condition extends Node {
 constructor(name,predicate){super(name);this.predicate=predicate;}
 update(context){return this.predicate(context)?SUCCESS:FAILURE;}
}
export class Action extends Node {
 constructor(name,{enter=()=>{},tick=()=>SUCCESS,exit=()=>{}}={}){super(name);this.enter=enter;this.execute=tick;this.exit=exit;this.active=false;}
 update(context){if(!this.active){this.active=true;this.enter(context);}const result=this.execute(context);if(result!==RUNNING){this.active=false;this.exit(context,result);}return result;}
 reset(context){if(this.active)this.exit(context,'aborted');this.active=false;super.reset(context);}
}
export class Sequence extends Node {
 constructor(name,children,{memory=false,onAbort=()=>{}}={}){super(name);this.children=children;this.memory=memory;this.cursor=0;this.onAbort=onAbort;}
 update(context){for(let i=this.memory?this.cursor:0;i<this.children.length;i++){const status=this.children[i].tick(context);if(status!==SUCCESS){for(let j=i+1;j<this.children.length;j++)this.children[j].reset(context);this.cursor=status===RUNNING?i:0;return status;}}this.cursor=0;return SUCCESS;}
 reset(context){if(this.status===RUNNING)this.onAbort(context);for(const child of this.children)child.reset(context);this.cursor=0;super.reset(context);}
}
// Reactive priority: a higher-priority branch may interrupt a running action.
export class Selector extends Node {
 constructor(name,children){super(name);this.children=children;this.selected=-1;}
 update(context){for(let i=0;i<this.children.length;i++){const status=this.children[i].tick(context);if(status!==FAILURE){for(let j=i+1;j<this.children.length;j++)this.children[j].reset(context);this.selected=i;return status;}}this.selected=-1;return FAILURE;}
 reset(context){for(const child of this.children)child.reset(context);this.selected=-1;super.reset(context);}
}
export class BehaviorTree {
 constructor(root){this.root=root;this.trace=[];}
 tick(context){this.trace=[];return this.root.tick({...context,trace:this.trace});}
 reset(context={}){this.root.reset(context);this.trace=[];}
}
