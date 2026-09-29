/**
 * 16x16 icons for items (by `ItemDef.icon`) and HUD buttons (`axe`).
 */
import { WORLD_PALETTE } from '../palette.ts'
import type { Picture } from '../types.ts'

export const ICONS: Readonly<Record<string, Picture>> = {
  'wood': {
    id: 'wood',
    width: 16,
    height: 16,
    palette: WORLD_PALETTE,
    frames: [
      [
        '................',
        '................',
        '............KKK.',
        '........KKKKIIUK',
        '....KKKKIIIIGGIK',
        '...KIIIIGGGGHHGK',
        '...KGGGGHHHHKKK.',
        '...KHHHHKKIIUK..',
        '..KKKKIIIIGGIK..',
        '.KIIIIGGGGHHGK..',
        '.KGGGGHHHHKKK...',
        '.KHHHHKKKK......',
        '..KKKK..........',
        '................',
        '................',
        '................',
      ],
    ],
  },
  'stone': {
    id: 'stone',
    width: 16,
    height: 16,
    palette: WORLD_PALETTE,
    frames: [
      [
        '................',
        '................',
        '................',
        '......KKKK......',
        '....KKyyyyKK....',
        '...KyyyyywwwK...',
        '..KyyyyywwwwwK..',
        '.KyyyyywwzwwwxK.',
        '.KyyywwwwwwwxxK.',
        '.KyywwzwwwwxxxK.',
        '.KywwwwzwwxxxxK.',
        '..KwwwwwxxxxxK..',
        '...KxxxxxxxxK...',
        '....KKxxxxKK....',
        '......KKKK......',
        '................',
      ],
    ],
  },
  'axe': {
    id: 'axe',
    width: 16,
    height: 16,
    palette: WORLD_PALETTE,
    frames: [
      [
        '.........KKKK...',
        '........KwwwwKK.',
        '........KwwwwKeK',
        '........KwwwwyeK',
        '........KwwwwyeK',
        '........KwwwwyK.',
        '.........KUwwyK.',
        '........KUTwwyK.',
        '.......KUTKKKK..',
        '......KUTK......',
        '.....KUTK.......',
        '....KUTK........',
        '...KUTK.........',
        '..KUTK..........',
        '...KK...........',
        '................',
      ],
    ],
  },
}
