import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { Flip } from 'gsap/Flip';
import { bezier } from '../design/tokens';

gsap.registerPlugin(CustomEase, Flip);

const cb = (b: readonly number[]) => `M0,0 C${b[0]},${b[1]} ${b[2]},${b[3]} 1,1`;

CustomEase.create('ip.standard', cb(bezier.standard));
CustomEase.create('ip.enter', cb(bezier.enter));
CustomEase.create('ip.exit', cb(bezier.exit));
CustomEase.create('ip.camera', cb(bezier.camera));
CustomEase.create('ip.press', cb(bezier.press));
CustomEase.create('ip.warpIn', cb(bezier.warpIn));
// ip.spring = back.out(1.35): register a named alias via a parsed ease function
gsap.registerEase('ip.spring', gsap.parseEase('back.out(1.35)'));

gsap.defaults({ ease: 'ip.standard' });
// UI tweens must finish on time even when a heavy WebGL frame stalls (also keeps headless captures deterministic).
gsap.ticker.lagSmoothing(0);

export { gsap, Flip, CustomEase };
