import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import type { ComponentType } from 'react';
import { Shell } from './components/Shell';
import { useApp, type SectionId } from './stores/app';
import { Overview } from './sections/Overview';
import { Settings } from './sections/Settings';
import { Companion } from './sections/Companion';
import { Challenges } from './sections/Challenges';
import { Crew } from './sections/Crew';
import { Physical } from './sections/Physical';
import { BrainHealth } from './sections/Brain';
import { Telemetry } from './sections/Telemetry';
import { Reports } from './sections/Reports';
import { Journal } from './sections/Journal';
import { Knowledge } from './sections/Knowledge';
import { Setup } from './sections/Setup';

const VIEWS: Record<SectionId, ComponentType> = {
  overview: Overview,
  crew: Crew,
  physical: Physical,
  brain: BrainHealth,
  journal: Journal,
  telemetry: Telemetry,
  challenges: Challenges,
  reports: Reports,
  knowledge: Knowledge,
  companion: Companion,
  settings: Settings,
  setup: Setup,
};

export function App() {
  const section = useApp((s) => s.section);
  const reduce = useApp((s) => s.prefs?.reducedMotion === 'reduce');
  const View = VIEWS[section];
  return (
    <MotionConfig reducedMotion={reduce ? 'always' : 'user'}>
      <Shell>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <View />
          </motion.div>
        </AnimatePresence>
      </Shell>
    </MotionConfig>
  );
}
