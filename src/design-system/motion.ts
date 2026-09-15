import { Easing } from 'react-native-reanimated';

import { motion } from './tokens';

export const standardEasing = Easing.bezier(...motion.easing);

export const timing = {
  fast: { duration: motion.fast, easing: standardEasing },
  base: { duration: motion.base, easing: standardEasing },
  slow: { duration: motion.slow, easing: standardEasing },
};
