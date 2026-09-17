/**
 * DmPttBar — شريط المكالمة الصوتية في صفحة chat.tsx
 *
 * CALLER:   أيقونة هاتف خضراء → tap → End فوري + "جاري الاتصال" → عند القبول: عداد
 * RECEIVER: أيقونة تومض + "لديك مكالمة" → tap → يدخل المكالمة → End
 * OPTIONS:  3 أزرار فعلية: Mute · Video · Speaker
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Video, VideoOff, Volume2, VolumeX, PhoneOff, MoreHorizontal } from 'lucide-react';
import { useGlobalCall } from '@/components/GlobalCallProvider';
import type {
  IAgoraRTCClient,
  IMicrophoneAudioTrack,
  ICameraVideoTrack,
  IAgoraRTCRemoteUser,
} from 'agora-rtc-sdk-ng';

const AGORA_APP_ID = '149ef04e839c4132a08efb49d717c436';

/* All colour values live in globals.css as --call-* custom properties.
   We reference them here via var() so no literal rgba/hex appears in JS. */
const V = {
  green:       'hsl(var(--call-green))',
  greenFaint:  'var(--call-green-faint)',
  greenBorder: 'var(--call-green-border)',
  greenGlow:   'var(--call-green-glow)',
  red:         'hsl(var(--destructive))',
  redFaint:    'var(--call-red-faint)',
  redBorder:   'var(--call-red-border)',
  cyan:        'hsl(var(--primary))',
  cyanFaint:   'var(--call-cyan-faint)',
  cyanBorder:  'var(--call-cyan-border)',
  text:        'var(--call-text)',
  textDim:     'var(--call-text-dim)',
  popupBg:     'hsl(var(--card))',
  popupShadow: 'var(--call-popup-shadow)',
  border:      'hsl(var(--border))',
  muted:       'hsl(var(--muted))',
  mutedFg:     'hsl(var(--muted-foreground))',
};

function PhoneIcon({ size = 14, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.8a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  );
}

interface DmPttBarProps {
  myId: string; myName: string; myAvatar: string;
  peerId: string; peerName: string; peerAvatar: string;
}

function dmChannel(a: string, b: string) { return a < b ? `dm-${a}-${b}` : `dm-${b}-${a}`; }
function fmt(s: number) { return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }

export default function DmPttBar({ myId, myName:_n, myAvatar:_a, peerId, peerName, peerAvatar }: DmPttBarProps) {
  type Phase = 'idle'|'calling'|'connected';
  const [phase,       setPhase]       = useState<Phase>('idle');
  const [callSeconds, setCallSeconds] = useState(0);
  const [showOptions, setShowOptions] = useState(false);
  const [muted,       setMuted]       = useState(false);
  const [videoOn,     setVideoOn]     = useState(false);
  const [speakerOn,   setSpeakerOn]   = useState(false);
  const [joining,     setJoining]     = useState(false);

  const phaseRef     = useRef<Phase>('idle');
  phaseRef.current   = phase;
  const timerRef     = useRef<ReturnType<typeof setInterval>|null>(null);
  const clientRef    = useRef<IAgoraRTCClient|null>(null);
  const micRef       = useRef<IMicrophoneAudioTrack|null>(null);
  const camRef       = useRef<ICameraVideoTrack|null>(null);
  const audiosRef    = useRef<HTMLAudioElement[]>([]);
  const sirenRef     = useRef<ReturnType<typeof setInterval>|null>(null);
  const sirenCtxRef  = useRef<AudioContext|null>(null);

  const { incomingCaller, acceptCall, startCall, endCall, wsSend } = useGlobalCall();
  const isRinging = !!(incomingCaller && incomingCaller.id === peerId);

  /* ── siren ── */
  const startSiren = useCallback(() => {
    const beep = () => {
      try {
        if (!sirenCtxRef.current || sirenCtxRef.current.state==='closed') sirenCtxRef.current = new AudioContext();
        const ctx=sirenCtxRef.current, osc=ctx.createOscillator(), g=ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.type='sine';
        osc.frequency.setValueAtTime(880,ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(1400,ctx.currentTime+0.2);
        osc.frequency.linearRampToValueAtTime(880,ctx.currentTime+0.4);
        g.gain.setValueAtTime(0.3,ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.55);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime+0.55);
      } catch {}
    };
    beep(); sirenRef.current = setInterval(beep,1300);
  },[]);
  const stopSiren = useCallback(()=>{ if(sirenRef.current) clearInterval(sirenRef.current); sirenRef.current=null; },[]);
  useEffect(()=>{ if(isRinging) startSiren(); else stopSiren(); return stopSiren; },[isRinging,startSiren,stopSiren]);

  /* ── timer ── */
  const startTimer = useCallback(()=>{
    setCallSeconds(0);
    if(timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(()=>setCallSeconds(s=>s+1),1000);
  },[]);
  const stopTimer = useCallback(()=>{
    if(timerRef.current) clearInterval(timerRef.current);
    timerRef.current=null; setCallSeconds(0);
  },[]);

  /* ── WS signal listener ── */
  useEffect(()=>{
    const h=(e:Event)=>{
      const msg=(e as CustomEvent).detail as Record<string,unknown>;
      if(!msg) return;
      if(msg.type==='answer' && msg.from===peerId && msg.accept===true && phaseRef.current==='calling'){
        void joinAgora(); startTimer();
      }
      if((msg.type==='answer' && msg.from===peerId && msg.accept===false)||(msg.type==='hangup' && msg.from===peerId)){
        if(phaseRef.current!=='idle'){ setPhase('idle'); setShowOptions(false); stopTimer(); void leaveAgora(); }
      }
    };
    window.addEventListener('call-signal',h);
    return ()=>window.removeEventListener('call-signal',h);
  },[peerId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Agora join ── */
  async function joinAgora(){
    if(clientRef.current) return;
    setJoining(true); setPhase('connected');
    try {
      const A=(await import('agora-rtc-sdk-ng')).default;
      A.setLogLevel(3);
      const c=A.createClient({mode:'rtc',codec:'vp8'} as any);
      clientRef.current=c;

      // stability: handle network quality
      c.on("network-quality", (stats: any) => {
        if (stats.uplinkNetworkQuality >= 5 || stats.downlinkNetworkQuality >= 5) {
          console.warn("[DmPttBar] Poor network connection detected.");
        }
      });

      // stability: handle reconnection
      c.on("connection-state-change", (cur: string) => {
        if (cur === 'RECONNECTING') console.log("[DmPttBar] Reconnecting...");
        if (cur === 'CONNECTED')    console.log("[DmPttBar] Connected");
      });

      c.on('user-published',async(u:IAgoraRTCRemoteUser,t:string)=>{
        if(t==='audio'){ await c.subscribe(u,'audio'); u.audioTrack?.play();
          setTimeout(()=>{ audiosRef.current=Array.from(document.querySelectorAll('audio')) as HTMLAudioElement[]; if(speakerOn) applySpeaker(true); },300); }
      });
      c.on('user-left',()=>{ if(phaseRef.current!=='idle'){ setPhase('idle'); setShowOptions(false); stopTimer(); void leaveAgora(); } });
      const ch=dmChannel(myId,peerId);
      const r=await fetch(`/api/call/token?channel=${encodeURIComponent(ch)}&uid=${encodeURIComponent(myId)}`, { credentials: 'include' });
      if (!r.ok) throw new Error('Unable to secure the call connection.');
      const {token, uid}=await r.json() as {token:string; uid:number};
      await c.join(AGORA_APP_ID,ch,token,uid);

      // Stability: set high-fidelity profile
      await (c as any).setAudioProfile('music_standard', 'game_streaming');

      const mic=await A.createMicrophoneAudioTrack({encoderConfig:'speech_standard'});
      micRef.current=mic; await c.publish([mic]);
    } catch(e){ console.error('[DmPttBar]',e); setPhase('idle'); setShowOptions(false); }
    finally { setJoining(false); }
  }

  /* ── Agora leave ── */
  async function leaveAgora(){
    if(camRef.current){ try{await clientRef.current?.unpublish([camRef.current]);}catch{} camRef.current.stop(); camRef.current.close(); camRef.current=null; }
    if(micRef.current){ try{await clientRef.current?.unpublish([micRef.current]);}catch{} micRef.current.stop(); micRef.current.close(); micRef.current=null; }
    try{await clientRef.current?.leave();}catch{} clientRef.current=null; audiosRef.current=[];
    setMuted(false); setVideoOn(false); setSpeakerOn(false);
  }

  function applySpeaker(on:boolean){ audiosRef.current.forEach(el=>{ if(typeof(el as any).setSinkId==='function')(el as any).setSinkId(on?'speaker':'').catch(()=>{}); }); }

  /* ── control handlers ── */
  function handleMute(){ const n=!muted; setMuted(n); micRef.current?.setEnabled(!n); }
  async function handleVideo(){
    if(!clientRef.current) return;
    const A=(await import('agora-rtc-sdk-ng')).default;
    if(!videoOn){ try{ const cam=await A.createCameraVideoTrack(); camRef.current=cam; await clientRef.current.publish([cam]); setVideoOn(true); }catch(e){console.error(e);} }
    else{ if(camRef.current){ try{await clientRef.current.unpublish([camRef.current]);}catch{} camRef.current.stop(); camRef.current.close(); camRef.current=null; } setVideoOn(false); }
  }
  function handleSpeaker(){ const n=!speakerOn; setSpeakerOn(n); applySpeaker(n); }

  const handleStartCall = useCallback(()=>{
    if(phase!=='idle') return;
    setPhase('calling'); startCall({peerId,peerName,peerAvatar:peerAvatar||null});
  },[phase,peerId,peerName,peerAvatar,startCall]);

  const handleCancel = useCallback(()=>{
    wsSend({type:'hangup',from:myId,to:peerId}); endCall(); setPhase('idle'); setShowOptions(false); stopTimer();
  },[myId,peerId,wsSend,endCall,stopTimer]);

  const handleHangup = useCallback(()=>{
    wsSend({type:'hangup',from:myId,to:peerId}); endCall(); setPhase('idle'); setShowOptions(false); stopTimer(); void leaveAgora();
  },[myId,peerId,wsSend,endCall,stopTimer]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAccept = useCallback(()=>{
    acceptCall(); setPhase('connected'); setShowOptions(false); void joinAgora(); startTimer();
  },[acceptCall,startTimer]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>()=>{ stopSiren(); stopTimer(); void leaveAgora(); },[]); // eslint-disable-line react-hooks/exhaustive-deps

  const dp: 'idle'|'calling'|'ringing'|'connected' = isRinging ? 'ringing' : phase;

  return (
    <div style={{marginBottom:6,position:'relative'}}>

      {/* ══ Options Popup ══ */}
      <AnimatePresence>
        {showOptions && dp==='connected' && (
          <>
            <div style={{position:'fixed',inset:0,zIndex:40}} onClick={()=>setShowOptions(false)}/>
            <motion.div key="opts"
              initial={{opacity:0,scale:0.9,y:10}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:0.9,y:10}}
              transition={{type:'spring',stiffness:360,damping:28}}
              onClick={e=>e.stopPropagation()}
              style={{
                position:'absolute',bottom:'calc(100% + 12px)',left:0,right:0,zIndex:50,
                background:V.popupBg,borderRadius:22,padding:'22px 20px 20px',
                boxShadow:V.popupShadow,border:`1px solid ${V.border}`,
              }}
            >
              {/* arrow */}
              <div style={{position:'absolute',bottom:-9,left:'50%',transform:'translateX(-50%)',
                width:0,height:0,borderLeft:'10px solid transparent',borderRight:'10px solid transparent',
                borderTop:`10px solid ${V.popupBg}`}}/>

              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
                <OptionBtn icon={muted?<MicOff size={24} color={V.red} strokeWidth={2}/>:<Mic size={24} color={V.text} strokeWidth={2}/>}
                  label={muted?'إلغاء الكتم':'Mute'} active={muted} activeColor={V.red} onClick={handleMute}/>
                <OptionBtn icon={videoOn?<Video size={24} color={V.cyan} strokeWidth={2}/>:<VideoOff size={24} color={V.text} strokeWidth={2}/>}
                  label={videoOn?'إيقاف الفيديو':'Video'} active={videoOn} activeColor={V.cyan} onClick={()=>void handleVideo()}/>
                <OptionBtn icon={speakerOn?<Volume2 size={24} color={V.green} strokeWidth={2}/>:<VolumeX size={24} color={V.text} strokeWidth={2}/>}
                  label={speakerOn?'سماعة الأذن':'Speaker'} active={speakerOn} activeColor={V.green} onClick={handleSpeaker}/>
              </div>

              {/* call timer inside popup */}
              <div style={{marginTop:18,display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                background:V.greenFaint,border:`1px solid ${V.greenBorder}`,borderRadius:14,padding:'11px 16px'}}>
                <motion.div animate={{opacity:[1,0.3,1]}} transition={{duration:1,repeat:Infinity}}
                  style={{width:7,height:7,borderRadius:'50%',background:V.green,flexShrink:0}}/>
                <span style={{color:V.green,fontSize:'1.05rem',fontWeight:800,fontVariantNumeric:'tabular-nums',letterSpacing:'0.06em'}}>
                  {fmt(callSeconds)}
                </span>
                <span style={{color:V.textDim,fontSize:'0.7rem'}}>مدة المكالمة</span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">

        {/* ══ IDLE ══ */}
        {dp==='idle' && (
          <motion.div key="idle" initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:4}} transition={{duration:0.15}}
            style={{display:'flex',alignItems:'center',gap:10,background:V.greenFaint,border:`1px solid ${V.greenBorder}`,borderRadius:14,padding:'10px 14px'}}>
            <PeerAvatar name={peerName} avatar={peerAvatar} size={36}/>
            <div style={{flex:1}}>
              <div style={{color:V.text,fontSize:'0.78rem',fontWeight:600}}>مكالمة صوتية</div>
              <div style={{color:V.textDim,fontSize:'0.67rem',marginTop:2}}>اضغط للاتصال بـ {peerName}</div>
            </div>
            <motion.button whileTap={{scale:0.85}} onClick={handleStartCall}
              style={{width:36,height:36,borderRadius:'50%',flexShrink:0,background:V.green,border:'none',cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',boxShadow:`0 3px 14px ${V.greenGlow}`}}>
              <PhoneIcon size={16} color="#fff"/>
            </motion.button>
          </motion.div>
        )}

        {/* ══ CALLING — جاري الاتصال + End فوري ══ */}
        {dp==='calling' && (
          <motion.div key="calling" initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:4}} transition={{duration:0.15}}
            style={{display:'flex',alignItems:'center',gap:10,background:V.greenFaint,border:`1px solid ${V.greenBorder}`,borderRadius:14,padding:'10px 14px'}}>
            <div style={{position:'relative',flexShrink:0}}>
              <motion.div animate={{scale:[1,1.7],opacity:[0.45,0]}} transition={{duration:1,repeat:Infinity}}
                style={{position:'absolute',inset:-5,borderRadius:'50%',border:`2px solid ${V.green}`,pointerEvents:'none'}}/>
              <PeerAvatar name={peerName} avatar={peerAvatar} size={36}/>
            </div>
            <div style={{flex:1}}>
              <motion.div animate={{opacity:[1,0.4,1]}} transition={{duration:1.2,repeat:Infinity}}
                style={{color:V.green,fontSize:'0.82rem',fontWeight:700}}>جاري الاتصال…</motion.div>
              <div style={{color:V.textDim,fontSize:'0.67rem',marginTop:2}}>{peerName}</div>
            </div>
            <motion.button whileTap={{scale:0.85}} onClick={handleCancel}
              style={{display:'flex',alignItems:'center',gap:5,background:V.redFaint,border:`1px solid ${V.redBorder}`,
                borderRadius:10,padding:'7px 14px',color:V.red,fontSize:'0.75rem',fontWeight:800,cursor:'pointer',flexShrink:0}}>
              <PhoneOff size={14} strokeWidth={2.5}/>End
            </motion.button>
          </motion.div>
        )}

        {/* ══ RINGING — لديك مكالمة ══ */}
        {dp==='ringing' && (
          <motion.div key="ringing"
            animate={{boxShadow:[`0 0 0px ${V.greenGlow}`,`0 0 24px ${V.greenGlow}`,`0 0 0px ${V.greenGlow}`],
              borderColor:[V.greenBorder,V.green,V.greenBorder]}}
            transition={{duration:0.85,repeat:Infinity}}
            style={{display:'flex',alignItems:'center',gap:10,background:V.greenFaint,border:`1.5px solid ${V.greenBorder}`,
              borderRadius:14,padding:'10px 14px',cursor:'pointer',position:'relative',overflow:'visible'}}
            onClick={handleAccept}>
            {[0,1].map(i=>(
              <motion.div key={i} animate={{scale:[1,2.2+i*0.4],opacity:[0.35,0]}}
                transition={{duration:1.1,delay:i*0.4,repeat:Infinity,ease:'easeOut' as const}}
                style={{position:'absolute',inset:-(4+i*5),borderRadius:18,border:`1.5px solid ${V.green}`,pointerEvents:'none',zIndex:0}}/>
            ))}
            <div style={{position:'relative',flexShrink:0,zIndex:1}}>
              <PeerAvatar name={peerName} avatar={peerAvatar} size={36} glowing/>
              <motion.div animate={{opacity:[1,0,1]}} transition={{duration:0.6,repeat:Infinity}}
                style={{position:'absolute',bottom:-3,right:-3,width:18,height:18,borderRadius:'50%',background:V.green,
                  display:'flex',alignItems:'center',justifyContent:'center',boxShadow:`0 0 8px ${V.greenGlow}`,zIndex:2}}>
                <PhoneIcon size={10} color="#fff"/>
              </motion.div>
            </div>
            <div style={{flex:1,zIndex:1}}>
              <div style={{color:V.text,fontSize:'0.78rem',fontWeight:700}}>{peerName}</div>
              <motion.div animate={{opacity:[1,0.3,1]}} transition={{duration:0.75,repeat:Infinity}}
                style={{color:V.green,fontSize:'0.72rem',marginTop:2,fontWeight:700}}>لديك مكالمة</motion.div>
            </div>
            <motion.button whileTap={{scale:0.85}} onClick={e=>{e.stopPropagation();handleAccept();}}
              animate={{scale:[1,1.08,1],boxShadow:[`0 0 0px ${V.greenGlow}`,`0 0 16px ${V.greenGlow}`,`0 0 0px ${V.greenGlow}`]}}
              transition={{duration:0.7,repeat:Infinity}}
              style={{width:36,height:36,borderRadius:'50%',flexShrink:0,zIndex:1,background:V.green,border:'none',cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center'}}>
              <PhoneIcon size={16} color="#fff"/>
            </motion.button>
          </motion.div>
        )}

        {/* ══ CONNECTED — عداد + End + خيارات ══ */}
        {dp==='connected' && (
          <motion.div key="connected" initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:4}} transition={{duration:0.15}}
            style={{display:'flex',alignItems:'center',gap:10,background:V.greenFaint,border:`1.5px solid ${V.greenBorder}`,borderRadius:14,padding:'10px 14px'}}>
            <PeerAvatar name={peerName} avatar={peerAvatar} size={36}/>
            <div style={{flex:1}}>
              <div style={{color:V.text,fontSize:'0.78rem',fontWeight:600}}>{joining?'جاري الاتصال…':`متصل — ${peerName}`}</div>
              {!joining && (
                <div style={{display:'flex',alignItems:'center',gap:5,marginTop:2}}>
                  <motion.div animate={{opacity:[1,0.3,1]}} transition={{duration:1,repeat:Infinity}}
                    style={{width:6,height:6,borderRadius:'50%',background:V.green,flexShrink:0}}/>
                  <span style={{color:V.green,fontSize:'0.72rem',fontWeight:800,fontVariantNumeric:'tabular-nums',letterSpacing:'0.04em'}}>
                    {fmt(callSeconds)}
                  </span>
                </div>
              )}
            </div>
            <motion.button whileTap={{scale:0.85}} onClick={()=>setShowOptions(v=>!v)}
              style={{width:34,height:34,borderRadius:9,flexShrink:0,
                background:showOptions?V.cyanFaint:V.muted,border:`1px solid ${showOptions?V.cyanBorder:V.border}`,
                cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <MoreHorizontal size={16} color={showOptions?V.cyan:V.mutedFg} strokeWidth={2}/>
            </motion.button>
            <motion.button whileTap={{scale:0.85}} onClick={handleHangup}
              style={{display:'flex',alignItems:'center',gap:5,background:V.redFaint,border:`1px solid ${V.redBorder}`,
                borderRadius:10,padding:'7px 14px',color:V.red,fontSize:'0.75rem',fontWeight:800,cursor:'pointer',flexShrink:0}}>
              <PhoneOff size={14} strokeWidth={2.5}/>End
            </motion.button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

function PeerAvatar({name,avatar,size,glowing=false}:{name:string;avatar:string;size:number;glowing?:boolean}){
  return (
    <div style={{width:size,height:size,borderRadius:'50%',flexShrink:0,overflow:'hidden',
      background:'var(--call-green-faint)',
      border:`1.5px solid ${glowing?'hsl(var(--call-green))':'var(--call-green-border)'}`,
      display:'flex',alignItems:'center',justifyContent:'center',
      boxShadow:glowing?`0 0 10px var(--call-green-glow)`:'none'}}>
      {avatar
        ?<img src={avatar} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
        :<span style={{color:'hsl(var(--call-green))',fontSize:`${size*0.42}px`,fontWeight:700}}>
          {name.charAt(0).toUpperCase()}
        </span>}
    </div>
  );
}

function OptionBtn({icon,label,active,activeColor,onClick}:{
  icon:React.ReactNode;label:string;active:boolean;activeColor:string;onClick:()=>void;
}){
  return (
    <motion.button whileTap={{scale:0.88}} onClick={onClick}
      style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,
        background:'hsl(var(--muted))',
        border:`1.5px solid ${active?activeColor:'hsl(var(--border))'}`,
        borderRadius:16,padding:'14px 8px',cursor:'pointer',transition:'border-color 0.18s',
        outline:active?`2px solid ${activeColor}`:'none',outlineOffset:'-2px'}}>
      {icon}
      <span style={{color:active?activeColor:'hsl(var(--muted-foreground))',fontSize:'0.68rem',fontWeight:600,whiteSpace:'nowrap'}}>
        {label}
      </span>
    </motion.button>
  );
}