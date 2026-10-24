// login013_ behavior "Filter Input Characters" (Director's library behavior): only
// the accepted characters get into the field, optionally case-corrected.

import { Behavior, beep, dontPassEvent, pass, sprite, the } from '../../director';
import { ENTER, LList, RETURN, charToNum, lingoCompare, numToChar, sym, type LSymbol, type LValue } from '../../lingo';

const UPPER = [193, 192, 194, 196, 195, 197, 199, 201, 200, 202, 203, 205, 204, 206, 207, 209, 211, 210, 212, 214, 213, 218, 217, 219, 220, 198, 216, 159];
const LOWER = [225, 224, 226, 228, 227, 229, 231, 233, 232, 234, 235, 237, 236, 238, 239, 241, 243, 242, 244, 246, 245, 250, 249, 251, 252, 230, 248, 255];

export class FilterInputCharacters extends Behavior {
  getPDLError: LValue;
  myCharacters: LValue = 'abcdefghijklmnopqrstuvwxyz 0123456789';
  myCase: LValue = 'UPPERCASE and lowercase';
  myCaseChange: LValue = 1;
  myAllowRETURN: LValue = 'yes';
  myBeepMode: LValue = 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  myMember: any;
  myMemberType: LValue;
  myLowercaseAccents: LList = new LList();
  myUPPERCASEAccents: LList = new LList();

  resolve(prop: LValue): LSymbol | undefined {
    if (prop === 'yes') return sym('yes');
    if (prop === 'no') return sym('no');
    return undefined;
  }

  beginSprite() {
    this.myAllowRETURN = this.resolve(this.myAllowRETURN);
    this.Initialize();
    the.selStart = this.myMember.text.length;
  }

  keyDown() {
    this.Filter();
  }

  Initialize() {
    this.myMember = sprite(this.spriteNum).member;
    if (this.myAllowRETURN === sym('yes')) this.myCharacters = String(this.myCharacters) + RETURN + ENTER;
    // the platform contains "Windows".
    this.myUPPERCASEAccents = new LList(UPPER.map(numToChar));
    this.myLowercaseAccents = new LList(LOWER.map(numToChar));
    this.myCharacters = this.GetCharacterList(String(this.myCharacters));
    this.myMember.editable = true;
  }

  Filter() {
    if ([48, 51, 117, 115, 116, 119, 121, 123, 124, 125, 126].includes(the.keyCode)) {
      return pass();
    }
    let theKey = the.key;
    const chars = this.myCharacters as LList;
    if (chars.getPos(theKey)) {
      return pass();
    } else {
      if (this.myCaseChange) {
        theKey = this.ChangeCase(theKey);
        if (chars.getPos(theKey)) {
          this.Insert(theKey);
          return;
        }
      }
      if (this.myBeepMode) beep();
      dontPassEvent();
    }
  }

  Insert(theKey: string) {
    const startChar = the.selStart;
    if (startChar === the.selEnd) {
      const t = this.myMember.text as string;
      this.myMember.text = t.slice(0, startChar) + theKey + t.slice(startChar);
    } else {
      const t = this.myMember.text as string;
      this.myMember.text = t.slice(0, startChar) + theKey + t.slice(the.selEnd);
    }
    the.selStart = this.myMember.text.length;
    dontPassEvent();
  }

  GetCharacterList(theString: string): LList {
    const characterList = new LList();
    const charCount = theString.length;
    for (let i = 1; i <= charCount; i++) {
      let theChar = theString[0];
      theString = theString.slice(1);
      if (characterList.getPos(theChar)) continue;
      switch (this.myCase) {
        case 'UPPERCASE and lowercase': {
          const otherCase = this.ChangeCase(theChar);
          if (lingoCompare(otherCase, theChar) !== 0) {
            if (!characterList.getPos(otherCase)) characterList.append(otherCase);
          }
          break;
        }
        case 'UPPERCASE ONLY':
          theChar = this.ChangeCase(theChar, sym('upper'));
          break;
        case 'lowercase only':
          theChar = this.ChangeCase(theChar, sym('lower'));
          break;
      }
      characterList.append(theChar);
    }
    return characterList;
  }

  ChangeCase(theChar: string, lowerOrUPPER?: LSymbol): string {
    const asciiCode = charToNum(theChar);
    if (lowerOrUPPER !== sym('lower') && lowerOrUPPER !== sym('upper')) lowerOrUPPER = asciiCode > 90 ? sym('upper') : sym('lower');
    if (lowerOrUPPER === sym('upper')) {
      const accent = this.myLowercaseAccents.getPos(theChar);
      if (accent) theChar = this.myUPPERCASEAccents.getAt(accent) as string;
      else if (asciiCode > 96 && asciiCode < 123) theChar = numToChar(asciiCode - 32);
    } else {
      const accent = this.myUPPERCASEAccents.getPos(theChar);
      if (accent) theChar = this.myLowercaseAccents.getAt(accent) as string;
      else if (asciiCode > 64 && asciiCode < 91) theChar = numToChar(asciiCode + 32);
    }
    return theChar;
  }
}

