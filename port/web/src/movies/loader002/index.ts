// loader002: the fan-made loader that reads main.ini and loads the game's files.

import { registerCast } from '../../director';
import { Spin } from './s002-spin';
import { BlobBehavior } from './s003-blob-behavior';
import { JumpMovie, SearchAndReplace, parseIniFile } from './s004-ini';
import { LoadMovie } from './s005-load-movie';
import { LoadIni } from './s006-load-ini';

registerCast('loader002', {
  scripts: { 2: Spin, 3: BlobBehavior, 5: LoadMovie, 6: LoadIni },
  handlers: { parseIniFile, SearchAndReplace, JumpMovie },
});
