import React from 'react';
import { Composition } from 'remotion';
import { DevpostDemo, DEVPOST_SECONDS } from './devpost';
import { DirectorsCut, DIRECTOR_SECONDS } from './director';
import { JudgingCut, JUDGING_SECONDS } from './judging';
import { FPS } from './kit';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="DevpostDemo" component={DevpostDemo} durationInFrames={DEVPOST_SECONDS * FPS} fps={FPS} width={1920} height={1080} />
    <Composition id="DirectorsCut" component={DirectorsCut} durationInFrames={DIRECTOR_SECONDS * FPS} fps={FPS} width={1920} height={1080} />
    <Composition id="JudgingCut" component={JudgingCut} durationInFrames={JUDGING_SECONDS * FPS} fps={FPS} width={1920} height={1080} />
  </>
);
