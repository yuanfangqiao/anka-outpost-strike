// CSS rotation is the fallback on browsers (including iOS) without orientation locking.
export function gameDelta({x,y},rotated=false){return rotated?{x:y,y:-x}:{x,y};}

const touchButtons=new WeakMap();
export function activateTouchButton(event){
 // Some browsers only synthesize a click for the primary finger. Other fingers
 // must still be able to use abilities or pause while the joystick is held.
 if(event.pointerType!=='touch'||event.isPrimary)return;
 const button=event.target.closest?.('button');
 if(!button||button.disabled||button.classList.contains('mobile-fire'))return;
 touchButtons.set(button,performance.now());event.preventDefault();button.click();
}
export function suppressTouchClick(event){
 const button=event.target.closest?.('button');
 if(event.isTrusted&&event.detail>0&&event.pointerType!=='mouse'&&button&&performance.now()-(touchButtons.get(button)??-1000)<800){
  event.preventDefault();event.stopImmediatePropagation();
 }
}

export function mobileViewport(win=window,nav=navigator){
 const enabled=win.matchMedia('(any-pointer: coarse)').matches||nav.maxTouchPoints>0;
 const width=win.visualViewport?.width||win.innerWidth,height=win.visualViewport?.height||win.innerHeight;
 const rotated=enabled&&height>width;
 return {enabled,rotated,width:Math.round(rotated?height:width),height:Math.round(rotated?width:height)};
}

export async function enterLandscape(){
 if(!mobileViewport().enabled)return;
 try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen?.({navigationUI:'hide'});}catch{/* Embedded browsers can deny fullscreen. */}
 try{await screen.orientation?.lock?.('landscape');}catch{/* Keep the rotated landscape layout. */}
}
