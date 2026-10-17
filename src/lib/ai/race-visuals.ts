// APPARENCE DES RACES pour les prompts d'illustration (forge, Création
// assistée). Ces descriptions disent ce qui FAIT la race (silhouette, peau,
// pilosité, ailes…), pas un rôle : une race n'est pas « un guerrier ». Le
// post-traitement de generate-text en place une en tête de l'illustrationPrompt
// pour que le modèle d'image ne dérive pas vers une autre race ; si elle
// imposait une armure ou une arme, toutes les cartes de la race porteraient la
// même (cf. les dix Nains en plates et bouclier hexagonal du 2026-10-12).
// L'équipement habituel vit à part, dans RACE_TYPICAL_GEAR, et n'est qu'une
// suggestion.

export const RACE_VISUALS: Record<string, string> = {
  // Elfes
  "Elfes": "tall, slender elven figure with pointed ears, elegant features, flowing hair",
  "Aigles Géants": "massive giant eagle with piercing eyes, powerful wingspan, golden-brown plumage, talons like swords",
  "Fées": "tiny luminous fairy with translucent butterfly/dragonfly wings, glowing aura, ethereal and delicate",
  // Alliance Céleste (La Forêt d'Émeraude)
  "Farfadets": "small mischievous leprechaun, weathered red-cheeked face under a wide green felt hat, buckled shoes and a worn waistcoat, clay pipe, gold coins spilling from a hidden pouch, sly knowing grin",
  "Korrigans": "stunted korrigan sprite of Breton legend, gnarled bark-like skin and oversized ears, tangled mossy hair strung with dolmen charms, squat and stubborn",
  "Faunes": "woodland faun, human torso above shaggy goat legs and cloven hooves, curling ram horns, pointed ears, reed panpipes at the lips, ivy in the hair",
  "Dryades": "woodland dryad, feminine figure whose skin is smooth living bark streaked with sap, hair of leaves and blossom shifting with the season, roots trailing from the feet into the soil, serene and unhurried",
  // Nains
  "Nains": "stout, broad-shouldered dwarf, short and stocky, thick braided beard, weathered ruddy face, heavy hands",
  "Golems": "massive stone or metal construct, glowing runes carved into body, hulking and mechanical, no organic features",
  "Machines": "articulated clockwork automaton of brass and iron, exposed gears and pistons, steam vents, riveted plating, glowing forge-lit core, engineered rather than sculpted",
  "Kobolds": "small scaly reptilian humanoid, snout and short horns, lantern-lit eyes adapted to deep tunnels, wiry and quick, waist-high to a dwarf",
  // Hobbits
  "Hobbits": "small halfling with bare hairy feet, round cheerful face, simple rustic clothing, shorter than a dwarf",
  "Hommes-Arbres": "towering treant/ent creature made of living wood, bark skin, branch limbs, leaves as hair, mossy and ancient",
  // Humains (Royaumes Libres)
  "Humains": "human of realistic proportions, medieval-era look",
  "Griffons": "majestic griffin with eagle head and front talons, powerful lion hindquarters, broad feathered wings, regal bearing, heraldic harness",
  "Faucons": "swift hunting falcon with sleek streamlined plumage, sharp hooked beak, piercing eyes, wings folded in a dive or spread mid-flight",
  // Royaumes Libres (Guerrières du Vent)
  "Pégases": "majestic winged horse, pure white coat, vast feathered swan-like wings spread wide, flowing mane and tail, powerful legs, noble and untamed",
  "Sphinx": "Greek sphinx, body of a lioness with great eagle wings folded at her sides and the head and bust of a stern woman, inscrutable knowing gaze",
  // Hommes-Bêtes
  "Hommes-Loups": "werewolf-like humanoid with wolf head, fur-covered muscular body, feral eyes, claws and fangs",
  "Hommes-Ours": "werebear-like humanoid, massive bear-headed figure, thick fur, enormous claws, towering and powerful",
  "Hommes-Félins": "feline humanoid with cat/panther features, lithe and agile body, whiskers, slit pupils, sleek fur",
  "Centaures": "centaur with human torso on horse body, wild mane, tribal markings",
  "Mimis": "small adorable beast-folk creature, fluffy oversized fur, big innocent eyes, tiny paws, cute and harmless-looking yet brave",
  // Élémentaires
  "La Colère des Flammes": "fire elemental, body made of living flames, molten core, embers floating around, intense heat haze",
  "Le Socle du Monde": "earth elemental, body of rock and stone, crystal growths, moss patches, heavy and immovable",
  "La Vague Sans Fin": "water elemental, body of flowing translucent water, whirlpool core, droplets suspended in air",
  "Le Souffle des Cimes": "storm elemental, body of swirling wind and lightning, crackling electricity, semi-transparent and volatile",
  // Mercenaires
  "Géants": "towering giant humanoid, standing several stories tall, craggy weathered features",
  "Ogres": "large brutish ogre, ugly face, thick skin, heavy gut",
  "Dragons": "magnificent dragon with scales, massive wings, long tail, breathing fire/ice/lightning, serpentine neck",
  "Chiens": "large hound or mastiff, powerful build, fierce and loyal",
  "Phoenix": "majestic phoenix bird engulfed in sacred flames, radiant feathers of gold and crimson, rebirth aura",
  "Anges": "celestial angelic being with luminous feathered wings, halo of light, ethereal beauty",
  "Ours": "massive bear, thick fur, powerful claws, intimidating presence",
  "Loups": "fierce dire wolf, larger than normal, piercing eyes, thick fur, pack hunter",
  // Orcs
  "Orcs": "green-skinned muscular orc, tusks, scarred face, savage and menacing",
  "Gobelins": "small green goblin, pointy ears, sharp teeth, sneaky and mischievous",
  "Trolls": "huge troll with regenerating flesh, long arms, hunched posture, warty skin, dim-witted but dangerous",
  "Wargs": "giant wolf-like warg beast, dark matted fur, red eyes, razor fangs, used as mount by orcs",
  // Morts-Vivants
  "Squelettes": "animated skeleton, hollow eye sockets with ghostly glow, bones and decay",
  "Zombies": "shambling undead corpse, rotting flesh, torn clothing, mindless hunger, decayed and horrifying",
  "Spectres": "ghostly translucent specter, floating ethereal form, glowing eyes, trailing wisps of ectoplasm",
  "Vampires": "elegant vampire, pale skin, red eyes, fangs, nocturnal predator",
  "Lich": "skeletal undead sorcerer in ornate robes, glowing phylactery, crown of dark magic, necromantic aura",
  "Banshees": "wailing ghostly female spirit, flowing spectral hair, mouth open in eternal scream, translucent and terrifying",
  // Elfes Noirs
  "Elfes Corrompus": "dark elf with ashen/obsidian skin, white hair, cruel features, malevolent aura",
  "Araignées Géantes": "enormous spider with dark chitin, multiple glowing eyes, venomous dripping fangs, web-covered",
  "Démons": "demonic creature with horns, cloven hooves, infernal flames, corrupted and terrifying; only some demons bear bat-like wings",
  // Nains (Guilde des Ingénieurs)
  "Gnomes": "small gnome, bushy beard, large nose, bright inquisitive eyes",
  // Légions du Chaos (Garde Noire)
  "Guerriers du Chaos": "towering chaos warrior in blackened spiked plate armor, corrupted heavy weapon, malevolent glowing runes, imposing and grim",
  // Empire du Milieu (Défenseurs d'Ivoire)
  "Nagas": "serpent temple guardian, human torso rising from a long coiling snake body, fanned cobra hood, jewelled iridescent scales, Khmer gold ornaments, serene and watchful",
  // Empire du Milieu (Lames de l'Ombre)
  "Tengu": "crow-spirit swordmaster of the Japanese mountains, large black feathered wings, crimson long-nosed face or corvid beak, yamabushi ascetic robes and small black tokin cap, feather fan and katana",
  "Oni": "hulking Japanese ogre-demon, red or deep blue skin, two short horns, wild black mane, tusked jaw, tiger-skin loincloth, iron bracelets, huge studded iron kanabo club, brutal and menacing",
  // Empire du Milieu (Empire de Jade)
  "Qilins": "Chinese qilin, auspicious celestial chimera with a dragon-like head and a single branching antler, deer body covered in shimmering jade-green and gold scales, ox tail, cloven hooves wreathed in soft flame and mist, stepping without bending the grass, serene and benevolent",
  // Nécropole (Rangs Silencieux)
  "Ghoules": "hunched flesh-eating ghoul, grey mottled skin stretched over a gaunt frame, long clawed fingers, jaw distended too wide, sunken eyes",
  // Nécropole (Cour Écarlate)
  "Homuncules de Sang": "small alchemical homunculus grown from blood, translucent crimson flesh over a fragile skeletal frame, glass tubes and stitched seams, malformed and pitiful, dripping",
  "Gargouilles": "winged stone gargoyle, cracked grey granite hide, curled horns, folded leathery stone wings, clawed talons, blank glowing eyes",
  "Dhampirs": "half-vampire, pale human features with faint fangs, cold restrained stare",
  "Chiroptères": "gaunt humanoid bat, huge outstretched membrane wings, oversized ears and flattened snout, dark fur",
  // Nécropole (Cénacle Nécromant)
  "Momies": "bandaged undead mummy, ancient linen wrappings blackened with resin and grave dust, gilded funerary mask and jewelled pectoral, dry withered limbs, hollow sockets lit from within, slow and inexorable",
  "Chimères nécrotiques": "necrotic chimera stitched from several corpses, mismatched animal heads on one bloated carcass, crude iron sutures and exposed ribs, mottled dead flesh, ichor dripping from the seams, hulking and brutal",
  "Vermines mortuaires": "seething swarm of charnel vermin, grave rats and carrion beetles pouring from a burst coffin, matted fur and glossy chitin, countless red pinprick eyes, a single writhing mass rather than one creature",
  // Nécropole (Voile Hurlant)
  "Poltergeists": "poltergeist manifestation, a half-seen twisted face forming in a whirl of hurled furniture and shattered crockery, translucent grasping limbs, objects frozen mid-flight, cold blue glow, no solid body",
  "Dullahans": "headless horseman dullahan, black plate armour on a rotting skeletal steed, severed grinning head carried under one arm, whip of human spine, green corpse-light in the eyes of the held head",
  "Sluaghs": "sluagh host of the restless dead, a dense flock of gaunt winged spirits pouring across a night sky, ragged membranous wings and clawed hands, hollow wailing faces, a single dark tide of souls",
  // Primordiaux (La Vague Sans Fin)
  "Ondins": "undine, blue-green scaled humanoid with finned forearms and a crested head, calm luminous eyes, water streaming from the shoulders",
  "Sirènes": "siren enchantress, humanoid torso above a long iridescent fish tail, wet flowing hair strung with pearls, webbed hands, hypnotic pale eyes",
  "Léviathans": "colossal leviathan of the abyss, immense serpentine sea beast breaching, barnacle-crusted armoured hide, rows of jagged teeth in a cavernous maw, ridged dorsal fins, dwarfing the waves around it",
  // Primordiaux (Le Socle du Monde)
  "Cristallins": "crystalline elemental, humanoid figure grown from faceted quartz and geode shards, light refracting through a translucent body, jagged mineral spurs at the shoulders, glowing core visible within the chest",
  "Troglodytes": "subterranean troglodyte, pale hairless cave dweller with oversized lidless eyes and elongated grasping fingers, stooped from low tunnels",
  "Bêtes Chtoniennes": "chthonic beast erupting from bedrock, vast burrowing horror of segmented stone-plated chitin, circular maw ringed with grinding teeth, blind and eyeless, showering earth and rubble",
  // Primordiaux (La Colère des Flammes)
  "Salamandres": "fire salamander elemental, sinuous lizard whose black scaled hide is cracked open by veins of molten orange, flames guttering along the spine and tail, clawed feet leaving scorch marks, smoke curling from the nostrils",
  // Primordiaux (Le Souffle des Cimes)
  "Sylphes": "sylph air spirit, slender translucent figure barely condensed out of moving air, hair and trailing veils drawn into visible wind currents, weightless mid-turn, edges dissolving into breeze",
  "Néphélides": "nephelid cloud nymph, figure formed of dense storm cloud with a humanoid silhouette, lightning flickering inside the vapour, rain falling from her trailing lower body, eyes like breaks of clear sky",
};

/** Équipement et tenue HABITUELS d'une race, retirés de RACE_VISUALS : une
 *  piste parmi d'autres, jamais une obligation. */
export const RACE_TYPICAL_GEAR: Record<string, string> = {
  "Elfes": "light armour with nature motifs, longbows, leaf-shaped blades",
  "Nains": "heavy plate armour, rune-engraved weapons and tools",
  "Kobolds": "scavenged mismatched armour, crude pickaxes and traps",
  "Humains": "medieval armour, robes, heraldry",
  "Centaures": "spears and bows",
  "Géants": "crude armour, massive clubs",
  "Ogres": "crude leather armour, clubs",
  "Chiens": "armoured war barding",
  "Anges": "divine armour",
  "Ours": "war barding",
  "Orcs": "brutal heavy armour",
  "Gobelins": "ragged clothing",
  "Squelettes": "rusted ancient armour",
  "Elfes Corrompus": "spiked dark armour",
  "Gnomes": "goggles, leather apron, clockwork gadgets",
  "Dhampirs": "dark leather duster, buckled straps, silvered blades",
  "Troglodytes": "stone-tipped spears",
  "Ondins": "coral-plated armour, barbed tridents",
  "Vampires": "aristocratic dark clothing",
};

/** Apparence accordée au genre : pour un sujet féminin, les traits de pilosité
 *  faciale (« thick braided beard ») sont retirés — sinon le préfixe ajouté
 *  d'office contredit le prompt (« Female dwarf spearwoman… ») et le modèle
 *  d'image hésite entre les deux. */
export function physiquePourGenre(desc: string, gender: string | null | undefined): string {
  if (gender !== "femme") return desc;
  const morceaux = desc.split(/,\s*/).filter((m) => !/\b(beard|bearded|moustache|mustache)\b/i.test(m));
  return morceaux.join(", ") || desc;
}
