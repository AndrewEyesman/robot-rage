// login013_: logging in, creating an account, the robot list and settings.

import { registerCast } from '../../director';
import { ButtonDown } from './s002-button-down';
import { BadWords } from './s004-bad-words';
import { LoginFrame } from './s009-login-frame';
import { EmailField } from './s010-email-field';
import { RobotNameField } from './s012-robot-name-field';
import { Scrap } from './s016-scrap';
import { Buttonscript } from './s019-buttonscript';
import { Listrobotsframe } from './s020-listrobotsframe';
import { RobotRow } from './s021-robot-row';
import { Marker } from './s023-marker';
import { LogoutFrame } from './s025-logout-frame';
import { FilterInputCharacters } from './s027-filter-input-characters';
import { Passwordbehavior } from './s028-passwordbehavior';
import * as macPc from './s029-mac-pc';
import * as netLingo from './s030-net-lingo';
import { AspCommunicationObject } from './s031-asp-communication-object';
import * as movieBehavior from './s032-movie-behavior';
import { UserObject } from './s033-user-object';
import { LoadingIndicator } from './s034-loading-indicator';
import { ToLogin } from './s036-to-login';
import { DodeleteRobot } from './s037-dodelete-robot';
import { ToCreate } from './s038-to-create';
import { SettingsFrame } from './s040-settings-frame';
import { PoplostPassword } from './s042-poplost-password';
import { HideIfNew } from './s043-hide-if-new';
import { Newsletter } from './s052-newsletter';
import { Country } from './s072-country';
import { Createbtn, Loginbtn, Namebtn, Newbtn, Quitbtn, Usebtn } from './s081-buttons';
import { Chatbut, Golist, Goset, Renderbut } from './s090-settings-buttons';
import { HorizontalScrollField } from './s097-horizontal-scroll-field';

registerCast('login013_', {
  scripts: {
    2: ButtonDown, 4: BadWords, 9: LoginFrame, 10: EmailField, 12: RobotNameField, 16: Scrap, 19: Buttonscript, 20: Listrobotsframe,
    21: RobotRow, 23: Marker, 25: LogoutFrame, 27: FilterInputCharacters, 28: Passwordbehavior, 31: AspCommunicationObject,
    33: UserObject, 34: LoadingIndicator, 36: ToLogin, 37: DodeleteRobot, 38: ToCreate, 40: SettingsFrame, 42: PoplostPassword,
    43: HideIfNew, 52: Newsletter, 72: Country, 81: Loginbtn, 82: Usebtn, 83: Createbtn, 84: Newbtn, 85: Namebtn, 87: Quitbtn,
    90: Goset, 91: Golist, 92: Chatbut, 97: HorizontalScrollField, 104: Renderbut,
  },
  names: { 'ASP communication object': AspCommunicationObject, 'user Object': UserObject, 'loading indicator': LoadingIndicator },
  handlers: { ...macPc, ...netLingo, ...movieBehavior },
});
