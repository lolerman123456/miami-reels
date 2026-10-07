import { Composition } from 'remotion';
import { Reel, ReelProps } from './Reel';
import { Viral, ViralProps } from './Viral';
import { Chat, ChatProps } from './Chat';
import { Ugc, UgcProps } from './Ugc';

const defaults: ReelProps = {
  fps: 30, width: 1080, height: 1920, durationInFrames: 300,
  narration: null, music: null, captions: [], scenes: [],
};

const viralDefaults: ViralProps = {
  durationInFrames: 300, video: 'clip.mp4', videoW: 1920, videoH: 1080, clipFrames: 210,
  intro: { frames: 90, warning: false, title: '', sub: '' }, banner: '', captions: [], freeze: null, credit: '',
};

const chatDefaults: ChatProps = { durationInFrames: 270, chatName: 'the boys 🌴', messages: [] };

const ugcDefaults: UgcProps = { durationInFrames: 300, video: 'base.mp4', timer: { line1: '', line2: '', seconds: 10 }, chunks: [], pops: [], zooms: [] };

export const RemotionRoot: React.FC = () => (<>
  <Composition
    id="Ugc"
    component={Ugc}
    defaultProps={ugcDefaults}
    fps={30}
    width={1080}
    height={1920}
    durationInFrames={300}
    calculateMetadata={({ props }) => ({ durationInFrames: props.durationInFrames })}
  />
  <Composition
    id="Chat"
    component={Chat}
    defaultProps={chatDefaults}
    fps={30}
    width={1080}
    height={1920}
    durationInFrames={270}
    calculateMetadata={({ props }) => ({ durationInFrames: props.durationInFrames })}
  />
  <Composition
    id="Viral"
    component={Viral}
    defaultProps={viralDefaults}
    fps={30}
    width={1080}
    height={1920}
    durationInFrames={300}
    calculateMetadata={({ props }) => ({ durationInFrames: props.durationInFrames })}
  />
  <Composition
    id="Reel"
    component={Reel}
    defaultProps={defaults}
    fps={30}
    width={1080}
    height={1920}
    durationInFrames={300}
    calculateMetadata={({ props }) => ({
      durationInFrames: props.durationInFrames,
      fps: props.fps, width: props.width, height: props.height,
    })}
  />
</>);
