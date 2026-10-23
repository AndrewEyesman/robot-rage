// Robot parts, translated from the game's part table (robotwars.cct).
// Field names are the original Swedish ones: namn = name, typ = type, pris = price,
// utrymme = space, vikt = weight, pansar1-3 = armour per chassis, monteras = fits on,
// kwh = energy use, kraft = power, model = 3D model names in the robot members.

export interface Part {
  namn: string;
  typ: string;
  pris?: number;
  utrymme?: number;
  vikt?: number;
  kwh?: number;
  kraft?: number;
  model?: string[];
  [key: string]: unknown;
}

export const parts: Record<string, Part> = {
  r1: {"namn": "Small Chassi", "typ": "ram", "pris": 150, "utrymme": 4, "vikt": 2, "pansar1": 5, "pansar2": 4, "pansar3": 3, "model": ["Ram liten"]},
  r2: {"namn": "Medium Chassi", "typ": "ram", "pris": 200, "utrymme": 6, "vikt": 3.5, "pansar1": 6, "pansar2": 5, "pansar3": 4, "model": ["Ram mellan"]},
  r3: {"namn": "Large Chassi", "typ": "ram", "pris": 400, "utrymme": 8, "vikt": 5, "pansar1": 8, "pansar2": 7, "pansar3": 6, "model": ["Ram stor"]},
  t1: {"namn": "Small Tower", "typ": "torn", "monteras": ["r1", "r2", "r3"], "pris": 100, "utrymme": 2, "vikt": 1, "pansar1": 3, "pansar2": 2, "pansar3": 1, "model": ["Torn litet"]},
  t2: {"namn": "Medium Tower", "typ": "torn", "monteras": ["r1", "r2", "r3"], "pris": 130, "utrymme": 3, "vikt": 1.7, "pansar1": 4, "pansar2": 3, "pansar3": 2, "model": ["Torn mellan"]},
  t3: {"namn": "Large Tower", "typ": "torn", "monteras": ["r1", "r2", "r3"], "pris": 250, "utrymme": 4, "vikt": 2, "pansar1": 5, "pansar2": 4, "pansar3": 3, "model": ["Torn stort"]},
  ma1: {"namn": "Small Engine", "typ": "motor", "monteras": ["r1", "r2", "r3"], "pris": 100, "utrymme": 1, "vikt": 2, "kwh": 20, "kraft": 50, "model": ["elmotorS"]},
  mb1: {"namn": "Small Engine DeLuxe", "typ": "motor", "monteras": ["r1", "r2", "r3"], "pris": 400, "utrymme": 1, "vikt": 1.8, "kwh": 10, "kraft": 75, "model": ["elmotorluxS"]},
  ma2: {"namn": "Medium Engine", "typ": "motor", "monteras": ["r1", "r2", "r3"], "pris": 150, "utrymme": 2, "vikt": 3.5, "kwh": 30, "kraft": 100, "model": ["elmotorM"]},
  mb2: {"namn": "Medium Engine DeLuxe", "typ": "motor", "monteras": ["r1", "r2", "r3"], "pris": 500, "utrymme": 2, "vikt": 3, "kwh": 20, "kraft": 150, "model": ["elmotorluxM"]},
  ma3: {"namn": "Large Engine", "typ": "motor", "monteras": ["r1", "r2", "r3"], "pris": 300, "utrymme": 3, "vikt": 4.5, "kwh": 40, "kraft": 200, "model": ["elmotorL"]},
  mb3: {"namn": "Large Engine DeLuxe", "typ": "motor", "monteras": ["r1", "r2", "r3"], "pris": 700, "utrymme": 3, "vikt": 4, "kwh": 30, "kraft": 300, "model": ["elmotorluxL"]},
  b1: {"namn": "Hydrogen Battery", "typ": "batteri", "monteras": ["r1", "r2", "r3"], "pris": 50, "utrymme": 1, "vikt": 1, "energi": 1000, "model": ["Brunbatteri"]},
  b2: {"namn": "Alkaline Battery", "typ": "batteri", "monteras": ["r1", "r2", "r3"], "pris": 100, "utrymme": 1, "vikt": 1, "energi": 2000, "model": ["Alkbatteri"]},
  b3: {"namn": "Nuclear Battery", "typ": "batteri", "monteras": ["r1", "r2", "r3"], "pris": 300, "utrymme": 0.5, "vikt": 1, "energi": 4000, "model": ["Bcell"]},
  v13: {"namn": "Nail Spreader", "typ": "vapen", "wpnPos": ["b"], "monteras": ["r1", "r2", "r3"], "pris": 75, "utrymme": 2, "vikt": 3, "skada": 2, "model": ["spik"]},
  v2: {"namn": "Flame Thrower", "typ": "vapen", "wpnPos": ["t"], "monteras": ["t1", "t2", "t3"], "pris": 350, "utrymme": 3, "vikt": 5, "skada": 10, "model": ["Eldkastare"]},
  v15: {"namn": "Oil Spreader", "typ": "vapen", "wpnPos": ["b"], "monteras": ["r1", "r2", "r3"], "pris": 71, "utrymme": 2, "vikt": 3, "skada": 0, "model": ["olja"]},
  v6: {"namn": "Plow", "typ": "vapen", "wpnPos": ["f", "b"], "monteras": ["r1", "r2", "r3"], "pris": 25, "utrymme": 0, "vikt": 4, "skada": 2, "model": ["Plog"]},
  v7: {"namn": "Dagger", "typ": "vapen", "wpnPos": ["f", "b"], "monteras": ["r1", "r2", "r3"], "pris": 10, "utrymme": 0, "vikt": 2, "skada": 3, "model": ["Pik"]},
  v8: {"namn": "Power Axe", "typ": "vapen", "wpnPos": ["f"], "monteras": ["r1", "r2", "r3"], "pris": 50, "utrymme": 2, "vikt": 3, "skada": 7, "model": ["Slagpik"]},
  v14: {"namn": "Glue Spreader", "typ": "vapen", "wpnPos": ["b"], "monteras": ["r1", "r2", "r3"], "pris": 80, "utrymme": 2, "vikt": 3, "skada": 0, "model": ["lim"]},
  v10: {"namn": "Drill", "typ": "vapen", "wpnPos": ["f", "b"], "monteras": ["r1", "r2", "r3"], "pris": 70, "utrymme": 2, "vikt": 2, "skada": 4, "model": ["Skruv"]},
  v11: {"namn": "Saw", "typ": "vapen", "wpnPos": ["f", "b"], "monteras": ["r1", "r2", "r3"], "pris": 70, "utrymme": 2, "vikt": 2, "skada": 4, "model": ["sgstag", "sgblad"]},
  v12: {"namn": "Rolling Pin", "typ": "vapen", "wpnPos": ["f", "b"], "monteras": ["r1", "r2", "r3"], "pris": 110, "utrymme": 3, "vikt": 4, "skada": 5, "model": ["Taggkavelstag", "Taggar"]},
  v21: {"namn": "Kamikaze Bomb", "typ": "vapen", "wpnPos": ["f", "b"], "monteras": ["r1", "r2", "r3"], "pris": 500, "utrymme": 2, "vikt": 3, "skada": 300, "model": ["bomb.1"]},
  v22: {"namn": "Armour Regenerator", "typ": "vapen", "wpnPos": ["t"], "monteras": ["t1", "t2", "t3"], "pris": 750, "utrymme": 2, "vikt": 3, "skada": 0, "model": ["regen"]},
  v23: {"namn": "Rear-View Camera", "typ": "vapen", "wpnPos": ["f", "b"], "monteras": ["r1", "r2", "r3"], "pris": 100, "utrymme": 1, "vikt": 1, "skada": 0, "model": ["rearcam"]},
  v24: {"namn": "Spear Gun", "typ": "vapen", "wpnPos": ["f", "b"], "monteras": ["r1", "r2", "r3"], "pris": 150, "utrymme": 2, "vikt": 2, "skada": 20, "model": ["speargun"]},
  v25: {"namn": "Flash Bombs", "typ": "vapen", "wpnPos": ["f", "b"], "monteras": ["r1", "r2", "r3"], "pris": 150, "utrymme": 3, "vikt": 4, "skada": 0, "model": ["flash"]},
  v26: {"namn": "Razor Discs", "typ": "vapen", "wpnPos": ["f", "b"], "monteras": ["r1", "r2", "r3"], "pris": 200, "utrymme": 3, "vikt": 4, "skada": 10, "model": ["spinndisc"]},
  v1: {"namn": "Land Mines", "typ": "vapen", "wpnPos": ["b"], "monteras": ["r1", "r2", "r3"], "pris": 320, "utrymme": 5, "vikt": 3, "skada": 15, "model": ["Mina"]},
  v9: {"namn": "The Claw", "typ": "vapen", "wpnPos": ["f", "b"], "monteras": ["r1", "r2", "r3"], "pris": 320, "utrymme": 3, "vikt": 4, "skada": 2, "model": ["Klo1", "Klo2"]},
  v4: {"namn": "Grenade Launcher", "typ": "vapen", "wpnPos": ["t"], "monteras": ["t1", "t2", "t3"], "pris": 320, "utrymme": 2, "vikt": 3, "skada": 25, "model": ["Granatkastare"]},
  v16: {"namn": "Guided Missiles", "typ": "vapen", "wpnPos": ["t"], "monteras": ["t1", "t2", "t3"], "pris": 320, "utrymme": 1, "vikt": 2, "skada": 25, "model": ["missilHN", "missilHU", "missilVN", "missilVU", "missil.1.1"]},
  v17: {"namn": "Heat-Seeking Missiles", "typ": "vapen", "wpnPos": ["t"], "monteras": ["t1", "t2", "t3"], "pris": 320, "utrymme": 1, "vikt": 2, "skada": 25, "model": ["missilHN", "missilHU", "missilVN", "missilVU", "missil.1"]},
  v3: {"namn": "Laser Cannon", "typ": "vapen", "wpnPos": ["t"], "monteras": ["t1", "t2", "t3"], "pris": 320, "utrymme": 2, "vikt": 1, "skada": 10, "model": ["laserkanon"]},
  p1: {"namn": "Super Pack 1", "typ": "paket", "pris": 500, "model": ["SP1"]},
  v31: {"namn": "Mini-Robot", "typ": "vapen", "wpnPos": ["f", "b"], "monteras": ["r1", "r2", "r3"], "pris": 320, "utrymme": 5, "vikt": 3, "skada": 100, "model": ["MineDropper", "RCbombcar"]},
  v32: {"namn": "Remote Charges", "typ": "vapen", "wpnPos": ["f", "b"], "monteras": ["r1", "r2", "r3"], "pris": 320, "utrymme": 3, "vikt": 4, "skada": 10, "model": ["RCMine"]},
  v33: {"namn": "Force Field", "typ": "vapen", "wpnPos": ["t"], "monteras": ["t1", "t2", "t3"], "pris": 320, "utrymme": 2, "vikt": 1, "skada": 10, "model": ["shield"]},
  v34: {"namn": "Cloaking Device", "typ": "vapen", "wpnPos": ["t"], "monteras": ["t1", "t2", "t3"], "pris": 320, "utrymme": 2, "vikt": 3, "skada": 0, "model": ["trans"]},
  v35: {"namn": "Mini-Gun", "typ": "vapen", "wpnPos": ["f", "b"], "monteras": ["r1", "r2", "r3"], "pris": 320, "utrymme": 2, "vikt": 2, "skada": 2, "model": ["Railgun"]},
  v36: {"namn": "EMP Bombs", "typ": "vapen", "wpnPos": ["f", "b"], "monteras": ["r1", "r2", "r3"], "pris": 320, "utrymme": 3, "vikt": 3, "skada": 0, "model": ["EMP"]},
  v37: {"namn": "Spy Cam", "typ": "vapen", "wpnPos": ["f", "b"], "monteras": ["r1", "r2", "r3"], "pris": 320, "utrymme": 0, "vikt": 0, "skada": 0, "model": ["spy"]},
  P2: {"namn": "Super Pack 2", "typ": "paket", "pris": 500, "model": ["SP2"]},
  h1: {"namn": "3 Small Wheels", "typ": "hjul", "monteras": ["r1", "r2", "r3"], "pris": 50, "utrymme": 0, "svangRadie": 5, "grepp": 1, "hitPoints": 3, "model": ["3hjulsmall", "litethjulHB", "litethjulVB", "litethjulMF"]},
  h2: {"namn": "4 Small Wheels", "typ": "hjul", "monteras": ["r1", "r2", "r3"], "pris": 75, "utrymme": 0, "svangRadie": 3, "grepp": 2, "hitPoints": 6, "model": ["4hjulsmall", "litethjulHF", "litethjulHB", "litethjulVF", "litethjulVB"]},
  h3: {"namn": "6 Small Wheels", "typ": "hjul", "monteras": ["r1", "r2", "r3"], "pris": 100, "utrymme": 0, "svangRadie": 1, "grepp": 3, "hitPoints": 10, "model": ["6hjulsmall", "litethjulHF", "litethjulHM", "litethjulHB", "litethjulVF", "litethjulVM", "litethjulVB"]},
  h4: {"namn": "4 Large Wheels", "typ": "hjul", "monteras": ["r1", "r2", "r3"], "pris": 125, "utrymme": 0, "svangRadie": 4, "grepp": 3, "hitPoints": 8, "model": ["4hjulstora", "storthjulHF", "storthjulHB", "storthjulVF", "storthjulVB"]},
  h5: {"namn": "6 Large Wheels", "typ": "hjul", "monteras": ["r1", "r2", "r3"], "pris": 150, "utrymme": 0, "svangRadie": 2, "grepp": 4, "hitPoints": 14, "model": ["6hjulstora", "storthjulHF", "storthjulHM", "storthjulHB", "storthjulVF", "storthjulVM", "storthjulVB"]},
};
