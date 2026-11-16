import React from 'react';
import { Still } from 'remotion';
import { Architecture, HelpMeRespond, Hero, HoldMyTurn, LivingNotch, MyVoice, RealResults, ReviewFirst, SilentToVoice, Social, Thumbnail, TwoModes } from './slides';

const G = { width: 1800, height: 1200 };
export const RemotionRoot: React.FC = () => (
  <>
    <Still id="g01" component={Hero} {...G} />
    <Still id="g02" component={SilentToVoice} {...G} />
    <Still id="g03" component={ReviewFirst} {...G} />
    <Still id="g04" component={LivingNotch} {...G} />
    <Still id="g05" component={MyVoice} {...G} />
    <Still id="g06" component={HoldMyTurn} {...G} />
    <Still id="g07" component={HelpMeRespond} {...G} />
    <Still id="g08" component={Architecture} {...G} />
    <Still id="g09" component={RealResults} {...G} />
    <Still id="g10" component={TwoModes} {...G} />
    <Still id="thumb" component={Thumbnail} width={1280} height={720} />
    <Still id="social" component={Social} width={1200} height={630} />
  </>
);
