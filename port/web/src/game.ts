// Robot Rage 2: Rearmed, the whole game: the player runs the original movies'
// scores with their scripts translated to TypeScript, starting at the loader as the
// fan wrapper did. ?movie=name[&frame=label] starts elsewhere (development).

import { boot, loadSystemFonts } from './director';
import { reportErrors } from './error-report';
import './movies';

const query = new URLSearchParams(location.search);
await loadSystemFonts('/assets');
const player = boot(document.getElementById('stage') as HTMLDivElement, '/assets');
if (query.get('reporterrors') !== '0') reportErrors(player);
void player.start(query.get('movie') ?? 'loader002', query.get('frame') ?? 1);
