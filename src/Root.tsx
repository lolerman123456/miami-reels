import { Composition } from 'remotion';
import { Reel, ReelProps } from './Reel';

const defaults: ReelProps = {
  fps: 30, width: 1080, height: 1920, durationInFrames: 300,
  narration: null, music: null, captions: [], scenes: [],
};

export const RemotionRoot: React.FC = () => (
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
);
