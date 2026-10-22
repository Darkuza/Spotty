// Wirkstoffkatalog: allgemeine Arzneimittelkunde zu den Mitteln, die in der Behandlung vorkommen können.
// Hier steht nur, was für jeden Hund gilt (Wirkstoff, Wirkweise, Strukturformel). Dosis, Uhrzeiten und
// Verlauf kommen aus dem Plan und der Akte. Die Texte stützen sich auf die unter „Quellen“ genannten Seiten.
// Die Strukturformeln stehen in structures.generated.ts (erzeugt mit tools/make-structures.py).

export interface Legend {
  /** Farbe der Hervorhebung in der Strukturformel: a orange, b blau */
  k: "a" | "b";
  text: string;
}

export interface MoleculeRef {
  /** Schlüssel in STRUCTURES */
  id: string;
  title?: string;
  legend?: Legend[];
  note?: string;
}

export interface SourceRef {
  label: string;
  url: string;
}

/** Foto des Wirkstoffs; die Datei liegt in src/assets/medications/ */
export interface PhotoRef {
  file: string;
  alt: string;
  /** Bildunterschrift: was das Foto zeigt */
  caption: string;
  /** Urheber, z. B. „Andrei Savitsky“ */
  author: string;
  /** Lizenz, z. B. „CC BY-SA 4.0“, „CC0“ oder „gemeinfrei“ */
  license: string;
  /** Lizenztext, sofern die Lizenz einen hat */
  licenseUrl?: string;
  /** Bearbeitung, z. B. „verkleinert“ */
  changes?: string;
  /** Seite des Bildes auf Wikimedia Commons */
  url: string;
}

export interface Substance {
  id: string;
  name: string;
  /** Wirkstoffgruppe, z. B. „Protonenpumpenhemmer“ */
  group: string;
  /** ein Satz, was der Stoff bewirkt (Liste und Kopf der Seite) */
  line: string;
  glyph: "capsule" | "drop" | "wind" | "flask";
  /** Namen, unter denen der Stoff im Plan und in der Akte vorkommt (Wirkstoff, Handelsnamen, Kürzel) */
  aliases: string[];
  /** Schreibweisen und Oberbegriffe, die nur vermutlich dazugehören (z. B. „Cortison“) */
  similar?: string[];
  /** Handelsnamen als Beispiele */
  brands?: string[];
  /** Was ist das? (zwei Sätze) */
  what: string;
  /** Wie wirkt es? (drei kurze Schritte) */
  how: string[];
  molecules: MoleculeRef[];
  /** Kennzahlen, die die Seite als Zeilen zeigt (z. B. die Zusammensetzung einer Infusion) */
  facts?: { title: string; rows: { label: string; value: string }[] };
  /** Gut zu wissen (höchstens drei Punkte) */
  know: string[];
  sources: SourceRef[];
  photo?: PhotoRef;
}

const WIKI = (title: string, label = title): SourceRef => ({ label: `${label} (Wikipedia)`, url: `https://de.wikipedia.org/wiki/${encodeURIComponent(title).replace(/%2F/g, "/")}` });

export const SUBSTANCES: Substance[] = [
  {
    id: "omeprazol",
    name: "Omeprazol",
    group: "Protonenpumpenhemmer",
    line: "Senkt die Magensäure",
    glyph: "capsule",
    aliases: ["omeprazol", "omeprazole"],
    what: "Omeprazol bremst die Säureproduktion im Magen. Die Schleimhaut von Magen und Speiseröhre wird weniger gereizt und kann abheilen.",
    how: [
      "Die magensaftresistente Hülle schützt den Wirkstoff vor der Magensäure. Er wird erst im Dünndarm frei und gelangt von dort ins Blut.",
      "Über das Blut erreicht er die säurebildenden Zellen der Magenwand. In deren sauren Kammern wandelt er sich in seine wirksame Form um.",
      "Die wirksame Form heftet sich unumkehrbar an die Protonenpumpe, das Eiweiß, das die Säure in den Magen pumpt. Die Zelle muss neue Pumpen bilden. Darum wirkt Omeprazol deutlich länger, als es im Blut nachweisbar ist.",
    ],
    molecules: [
      {
        id: "omeprazol",
        legend: [{ k: "a", text: "Die Sulfinylgruppe (S=O) zwischen den beiden Ringen ist der Schalter: In der Säure entsteht aus ihr die wirksame Form, die sich an die Pumpe heftet." }],
      },
    ],
    know: [
      "Am besten wirkt die Gabe 30 bis 45 Minuten vor einer Mahlzeit, weil die Pumpen mit dem Fressen aktiv werden.",
      "Magensaftresistente Tabletten dürfen nicht zerkaut oder zerrieben werden. Ob sich eine Tablette teilen lässt, steht im Beipackzettel.",
      "Nach mehr als drei bis vier Wochen wird ausgeschlichen, damit die Säureproduktion nicht überschießt. Bei langer Gabe können sich die Darmbakterien verändern; die Dauer legt die Klinik fest.",
    ],
    sources: [WIKI("Omeprazol"), { label: "Gastrointestinal Ulcers in Monogastric Animals (MSD Veterinary Manual)", url: "https://www.msdvetmanual.com/pharmacology/systemic-pharmacotherapeutics-of-the-digestive-system/drugs-used-to-treat-gastrointestinal-ulcers-in-monogastric-animals" }],
    photo: {
      file: "omeprazol.webp",
      alt: "Zwei gelbe Kapseln und ein Häufchen weißer Pellets auf hellem Grund",
      caption: "Omeprazol-Kapseln und die magensaftresistenten Pellets aus einer geöffneten Kapsel",
      author: "W.carter",
      license: "CC0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/deed.de",
      changes: "zugeschnitten und verkleinert",
      url: "https://commons.wikimedia.org/wiki/File:Omeprazol_Activis_capsules.jpg",
    },
  },
  {
    id: "prednisolon",
    name: "Prednisolon",
    group: "Glukokortikoid (Cortison)",
    line: "Hemmt Entzündungen und dämpft die Abwehr",
    glyph: "capsule",
    aliases: ["prednisolon", "prednisolone"],
    similar: ["cortison", "kortison"],
    what: "Prednisolon ist ein künstlich hergestellter Verwandter des Nebennierenhormons Cortisol. Es dämpft Entzündungen und Abwehrreaktionen und wird bei entzündlichen und allergischen Erkrankungen eingesetzt.",
    how: [
      "Als fettlösliches Steroid dringt es in die Zellen ein und bindet an den Glukokortikoid-Rezeptor.",
      "Der Komplex wandert in den Zellkern und verändert, welche Gene abgelesen werden. Entzündungsfördernde Botenstoffe wie Prostaglandine und Zytokine werden weniger gebildet.",
      "Schwellung, Schleimbildung und Abwehrreaktion gehen zurück. Das Immunsystem wird insgesamt gedämpft.",
    ],
    molecules: [
      {
        id: "prednisolon",
        legend: [{ k: "a", text: "Der A-Ring (links) trägt gegenüber Cortisol eine zusätzliche Doppelbindung. Sie macht das Molekül mehrfach stärker entzündungshemmend." }],
      },
    ],
    know: [
      "Nach längerer Gabe wird ausgeschlichen: Die Nebenniere stellt ihre eigene Cortisolbildung zurück, und ein plötzliches Absetzen kann eine Krise mit Schwäche, Erbrechen und Durchfall auslösen.",
      "Typisch sind mehr Durst, häufigeres Wasserlassen und mehr Appetit. Bei längerer Gabe kommen Muskelabbau, dünnere Haut und Infektanfälligkeit hinzu.",
      "Mit Schmerz- und Entzündungsmitteln aus der Gruppe der NSAR (zum Beispiel Meloxicam) steigt das Risiko für Magengeschwüre und Blutungen.",
    ],
    sources: [
      WIKI("Prednisolon"),
      { label: "Corticosteroids in Animals (MSD Veterinary Manual)", url: "https://www.msdvetmanual.com/pharmacology/inflammation/corticosteroids-in-animals" },
      { label: "Fachinformation Prednisolon 5 mg für Hund und Katze (CP-Pharma)", url: "https://www.cp-pharma.de/media/85/9b/7e/1773664387/SPC-Prednisolon-5mg_02-2026.pdf" },
    ],
  },
  {
    id: "dexamethason",
    name: "Dexamethason",
    group: "Glukokortikoid (Cortison)",
    line: "Besonders starkes, lange wirksames Cortison",
    glyph: "drop",
    aliases: ["dexamethason", "dexa"],
    similar: ["cortison", "kortison"],
    what: "Dexamethason gehört wie Prednisolon zu den Glukokortikoiden. Es wirkt etwa 25-mal stärker als Cortisol und hält mit zwei bis drei Tagen länger an als Prednisolon.",
    how: [
      "Wie Prednisolon bindet es in der Zelle an den Glukokortikoid-Rezeptor und verändert, welche Gene abgelesen werden. Entzündung und Abwehrreaktion werden gedämpft.",
      "Zwei Zusätze am Grundgerüst verstärken die Wirkung: ein Fluoratom an C9 und eine Methylgruppe an C16.",
      "Das Molekül haftet fester am Rezeptor und wird langsamer abgebaut. Eine einzelne Gabe wirkt deshalb tagelang nach.",
    ],
    molecules: [
      {
        id: "dexamethason",
        legend: [{ k: "a", text: "Fluor (C9) und Methylgruppe (C16) sind die Zusätze gegenüber Prednisolon. Die Methylgruppe entfernt außerdem die Salzwirkung des Cortisols." }],
      },
    ],
    know: [
      "Die Nebenwirkungen ähneln denen des Prednisolons: mehr Durst und Harndrang, bei längerer Gabe Muskelabbau und Infektanfälligkeit.",
      "Dexamethason bremst die körpereigene Cortisolbildung stärker und länger als Prednisolon. Nach längerer Gabe wird deshalb ausgeschlichen.",
      "Zusammen mit NSAR (Meloxicam und Verwandte) steigt das Risiko für Magengeschwüre.",
    ],
    sources: [WIKI("Dexamethason"), { label: "Corticosteroids in Animals (MSD Veterinary Manual)", url: "https://www.msdvetmanual.com/pharmacology/inflammation/corticosteroids-in-animals" }],
  },
  {
    id: "sucralfat",
    name: "Sucralfat",
    group: "Magenschutz",
    line: "Soll wunde Schleimhaut wie ein Verband schützen",
    glyph: "flask",
    aliases: ["sucrabest", "sucralfat", "sucralfate", "ulcogant", "sucralan"],
    brands: ["Sucrabest", "Ulcogant", "Sucralan"],
    what: "Sucralfat ist ein Aluminiumsalz von Saccharose-octasulfat, einem Zucker mit acht Sulfatgruppen. Es soll sich auf wunde Stellen in Speiseröhre und Magen legen und sie vor Säure schützen.",
    how: [
      "Im sauren Magensaft zerfällt Sucralfat in Saccharose-octasulfat und Aluminiumhydroxid.",
      "Das Saccharose-octasulfat wird zu einer klebrigen, zähen Schicht und haftet an Eiweiß, wie es in wunden Stellen freiliegt.",
      "Die Schicht hält Säure und das Verdauungsenzym Pepsin fern, bindet Gallensäuren und regt die Bildung von Prostaglandinen an, die die Schleimhaut schützen.",
    ],
    molecules: [
      {
        id: "saccharose-octasulfat",
        title: "Saccharose-octasulfat",
        legend: [{ k: "a", text: "Eine der acht Sulfatgruppen (–OSO₃H) ist markiert. Sie sind stark negativ geladen und lagern sich an Eiweiß in wunden Stellen an." }],
        note: "Das Aluminiumsalz hat keine einheitliche Einzelstruktur. Gezeigt ist der Zuckeranteil.",
      },
    ],
    know: [
      "Beim Hund ist der Nutzen weniger gut belegt als bei Säureblockern wie Omeprazol.",
      "Zwischen Sucralfat und anderen Medikamenten sollen mindestens zwei Stunden liegen, weil es Wirkstoffe binden und ihre Aufnahme verändern kann.",
      "Es wirkt vor Ort und gelangt kaum ins Blut. Das Aluminium kann verstopfen; bei Nierenschwäche wird mehr davon aufgenommen.",
    ],
    sources: [WIKI("Sucralfat"), { label: "Gastrointestinal Ulcers in Monogastric Animals (MSD Veterinary Manual)", url: "https://www.msdvetmanual.com/pharmacology/systemic-pharmacotherapeutics-of-the-digestive-system/drugs-used-to-treat-gastrointestinal-ulcers-in-monogastric-animals" }],
  },
  {
    id: "natriumchlorid",
    name: "Kochsalz und Sole",
    group: "Inhalationslösung",
    line: "Befeuchtet die Atemwege und löst Schleim",
    glyph: "wind",
    aliases: ["sole", "emser sole", "kochsalz", "kochsalzlösung", "nacl", "natriumchlorid"],
    brands: ["Emser Sole"],
    what: "Kochsalz ist Natriumchlorid (NaCl). Als Lösung mit 0,9 % Salzgehalt ist es isotonisch, entspricht also dem Salzgehalt der Körperflüssigkeit. Emser Sole ist ein natürliches Salzgemisch, hauptsächlich aus Natrium, Hydrogencarbonat und Chlorid, mit etwas Kalium, Magnesium und Calcium.",
    how: [
      "Ein Vernebler macht aus der Lösung einen feinen Nebel, der mit der Atemluft in die Atemwege gelangt, je nach Gerät bis in die unteren.",
      "Das Salzwasser benetzt die Schleimhaut und verdünnt zähen Schleim.",
      "Dünner Schleim lässt sich von den Flimmerhärchen der Atemwege leichter abtransportieren und abhusten. Emser Sole regt außerdem deren Schlag an.",
    ],
    molecules: [
      {
        id: "natriumchlorid",
        title: "Natriumchlorid im Kristall",
        legend: [
          { k: "a", text: "Natrium-Ionen (Na⁺) sind klein und positiv geladen." },
          { k: "b", text: "Chlorid-Ionen (Cl⁻) sind größer und negativ geladen. Im Salzkristall wechseln sich beide ab, im Wasser lösen sie sich voneinander." },
        ],
      },
    ],
    facts: { title: "Isotonische Kochsalzlösung", rows: [{ label: "Salzgehalt", value: "0,9 % (9 g NaCl je Liter)" }] },
    know: [
      "Die Wirkung beruht auf Wasser und Salz. Sehr selten löst die Inhalation bei empfindlichen Atemwegen eine krampfartige Verengung mit Atemnot aus. Dann abbrechen und die Klinik verständigen.",
      "Ampullen sind zum einmaligen Gebrauch bestimmt. Nach dem Öffnen sofort aufbrauchen, Reste verwerfen.",
    ],
    sources: [WIKI("Natriumchlorid"), { label: "Emser Sole Inhalat, Fachinformation (fachinfo.de)", url: "https://www.fachinfo.de/pdf/010026" }],
    photo: {
      file: "natriumchlorid.webp",
      alt: "Weißes, feinkörniges Salz in einer dunklen Metallschale",
      caption: "Natriumchlorid (Kochsalz), feinkörnig",
      author: "Chemicalinterest",
      license: "gemeinfrei",
      changes: "zugeschnitten und verkleinert",
      url: "https://commons.wikimedia.org/wiki/File:Sodium_chloride_2.JPG",
    },
  },
  {
    id: "salmeterol-fluticason",
    name: "Salmeterol und Fluticason",
    group: "Inhalationsspray",
    line: "Erweitert die Bronchien und hemmt die Entzündung",
    glyph: "wind",
    aliases: ["salmeterol", "fluticason", "fluticasonpropionat", "seretide"],
    brands: ["Seretide (Dosieraerosol)"],
    what: "Ein Dosierspray mit zwei Wirkstoffen: Salmeterol erweitert die Bronchien, Fluticason, ein inhalatives Cortison, hemmt die Entzündung in den Atemwegen. Der Sprühstoß wird über Inhalationskammer und Maske eingeatmet.",
    how: [
      "Der Sprühstoß gelangt mit der Atemluft in die Bronchien. Fluticason haftet an der Schleimhaut und bindet in den Zellen an Glukokortikoid-Rezeptoren: Die Entzündung geht zurück, die Schleimhaut schwillt ab.",
      "Salmeterol aktiviert β₂-Rezeptoren in der Bronchialmuskulatur. Die Muskeln erschlaffen, und die Atemwege werden weiter.",
      "Seine lange Seitenkette hält Salmeterol in der Zellmembran nahe am Rezeptor fest. Es wirkt viele Stunden lang, setzt aber langsam ein und hilft deshalb nicht bei akuter Atemnot.",
    ],
    molecules: [
      {
        id: "salmeterol",
        title: "Salmeterol",
        legend: [
          { k: "a", text: "Der Kopf (Saligenin-Gruppe) passt in die Bindetasche des β₂-Rezeptors." },
          { k: "b", text: "Der lange, fettliebende Schwanz verankert das Molekül in der Zellmembran nahe am Rezeptor. Das erklärt die lange Wirkdauer." },
        ],
      },
      {
        id: "fluticasonpropionat",
        title: "Fluticasonpropionat",
        legend: [
          { k: "a", text: "Der S-Fluormethyl-Thioester wird in der Leber rasch zu einer praktisch unwirksamen Säure abgebaut. So bleibt die Wirkung auf die Lunge konzentriert." },
          { k: "b", text: "Der Propionat-Ester macht das Molekül sehr fettliebend. Es haftet gut an der Schleimhaut und bindet fest an den Rezeptor." },
        ],
      },
    ],
    know: [
      "Das Cortison wirkt vor allem in der Lunge, gelangt aber auch ins Blut. Beim Hund sind mehr Appetit, Durst, Harndrang und Hecheln beschrieben, und die körpereigene Cortisolbildung kann gedämpft werden.",
      "Salmeterol ist ein β₂-Agonist. Solche Mittel können Zittern und einen schnelleren Herzschlag auslösen.",
    ],
    sources: [WIKI("Salmeterol"), WIKI("Fluticason")],
  },
  {
    id: "metamizol",
    name: "Metamizol",
    group: "Schmerzmittel",
    line: "Lindert Schmerzen und löst Krämpfe",
    glyph: "capsule",
    aliases: ["metamizol", "novaminsulfon", "novalgin", "novacen"],
    brands: ["Novaminsulfon", "Novalgin", "Novacen"],
    what: "Metamizol ist ein Schmerz- und Fiebermittel aus der Gruppe der Pyrazolone. Es lindert Schmerzen, senkt Fieber und entspannt glatte Muskulatur, etwa bei Bauchkrämpfen.",
    how: [
      "Metamizol ist eine Vorstufe. Im Körper wird es zum eigentlichen Wirkstoff 4-Methylaminophenazon (4-MAA) gespalten.",
      "Man vermutet vor allem eine Hemmung der Cyclooxygenasen im Nervensystem: Es entstehen weniger Prostaglandine, die Schmerz und Fieber verstärken. Der genaue Mechanismus ist nicht vollständig geklärt.",
      "Außerdem entspannt es glatte Muskulatur im Magen-Darm-Trakt. Das erklärt die Wirkung bei krampfartigen Bauchschmerzen.",
    ],
    molecules: [
      {
        id: "metamizol",
        title: "Metamizol-Natrium",
        legend: [{ k: "a", text: "Die Methansulfonat-Gruppe macht den Stoff gut wasserlöslich, hier als Natriumsalz. Im Körper wird sie abgespalten, und es bleibt der Wirkstoff 4-MAA." }],
      },
    ],
    know: [
      "Nicht geeignet sind Magen-Darm-Geschwüre, chronische Magen-Darm-Erkrankungen, Nierenschwäche, Blutbild- und Gerinnungsstörungen sowie Asthma.",
      "Zusammen mit Glukokortikoiden (Prednisolon, Dexamethason) steigt die Gefahr von Blutungen im Magen-Darm-Trakt. Bei empfindlichen Tieren kann es Bronchospasmen auslösen.",
      "Bei längerer Gabe sind Blutbildveränderungen auch beim Hund beschrieben, darum wird das Blutbild kontrolliert. Die schwere Agranulozytose kennt man vom Menschen.",
    ],
    sources: [WIKI("Metamizol")],
    photo: {
      file: "metamizol.webp",
      alt: "Farbige, strahlenförmig gewachsene Kristalle im polarisierten Licht",
      caption: "Metamizol-Kristalle (Analgin) unter dem Polarisationsmikroskop",
      author: "Andrei Savitsky",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/deed.de",
      changes: "zugeschnitten und verkleinert",
      url: "https://commons.wikimedia.org/wiki/File:%D0%9B%D0%B5%D0%BA%D0%B0%D1%80%D1%81%D1%82%D0%B2%D0%B5%D0%BD%D0%BD%D1%8B%D0%B5_%D0%BF%D1%80%D0%B5%D0%BF%D0%B0%D1%80%D0%B0%D1%82%D1%8B_%D0%BF%D0%BE%D0%B4_%D0%BC%D0%B8%D0%BA%D1%80%D0%BE%D1%81%D0%BA%D0%BE%D0%BF%D0%BE%D0%BC._%D0%90%D0%BD%D0%B0%D0%BB%D1%8C%D0%B3%D0%B8%D0%BD.jpg",
    },
  },
  {
    id: "metoclopramid",
    name: "Metoclopramid",
    group: "Mittel gegen Übelkeit",
    line: "Hilft gegen Übelkeit und fördert die Magenentleerung",
    glyph: "capsule",
    aliases: ["metoclopramid", "metomotyl", "mcp", "emeprid", "paspertin"],
    brands: ["Metomotyl", "MCP", "Emeprid", "Paspertin"],
    what: "Metoclopramid wirkt gegen Übelkeit und Erbrechen und regt zugleich die Bewegung von Magen und oberem Dünndarm an. Der Mageninhalt wird schneller weitertransportiert.",
    how: [
      "Im Gehirn blockiert es Dopamin-Rezeptoren (D2), die an der Auslösung von Übelkeit beteiligt sind.",
      "Im Magen-Darm-Trakt fördert es die Peristaltik, und der Pförtner am Magenausgang öffnet sich häufiger. Der Magen entleert sich schneller.",
      "Weniger Mageninhalt und rascherer Weitertransport mindern Völlegefühl und Rückfluss.",
    ],
    molecules: [
      {
        id: "metoclopramid",
        legend: [
          { k: "a", text: "Das Benzamid-Gerüst bindet an Dopamin- und Serotonin-Rezeptoren." },
          { k: "b", text: "Die basische Diethylamino-Seitenkette trägt im Körper eine positive Ladung, die für die Bindung am Rezeptor wichtig ist." },
        ],
      },
    ],
    know: [
      "Nicht geeignet sind Magen-Darm-Blutung, Darmverschluss und Darmdurchbruch. Bei Krampfleiden (Epilepsie) und nach einem Schädeltrauma ist es zu vermeiden.",
      "Mögliche Nebenwirkungen betreffen das Nervensystem: Unruhe, Zittern und Bewegungsstörungen. Sie klingen nach dem Absetzen ab. Mit beruhigenden Mitteln wie Acepromazin steigt das Risiko dafür.",
      "Tabletten verschiedener Hersteller enthalten unterschiedlich viel Wirkstoff, zum Beispiel 5 mg und 10 mg. Beim Wechsel der Packung die Stärke prüfen.",
    ],
    sources: [
      WIKI("Metoclopramid"),
      { label: "Metomotyl 5 mg Kautabletten für Hunde, Gebrauchsinformation (Medikamio)", url: "https://medikamio.com/de-at/medikamente/metomotyl-5-mg-kautabletten-fur-hunde/pil" },
      { label: "Drugs Used to Control or Stimulate Vomiting (MSD Veterinary Manual)", url: "https://www.msdvetmanual.com/pharmacology/systemic-pharmacotherapeutics-of-the-digestive-system/drugs-used-to-control-or-stimulate-vomiting-in-monogastric-animals" },
    ],
  },
  {
    id: "maropitant",
    name: "Maropitant",
    group: "Mittel gegen Erbrechen",
    line: "Blockiert den Brechreiz im Gehirn",
    glyph: "drop",
    aliases: ["maropitant", "prevomax", "cerenia"],
    brands: ["Cerenia", "Prevomax"],
    what: "Maropitant ist ein Mittel gegen Erbrechen, das für Hunde und Katzen zugelassen ist. Es wirkt gegen Erbrechen aus verschiedenen Ursachen.",
    how: [
      "Der Botenstoff Substanz P bindet an NK1-Rezeptoren und löst den Brechreflex aus. Diese Rezeptoren liegen im Hirnstamm, wo die Signale aus dem Magen-Darm-Trakt und dem Brechzentrum zusammenlaufen.",
      "Maropitant besetzt die NK1-Rezeptoren, ohne sie zu aktivieren. Substanz P findet keinen Platz mehr.",
      "Der Brechreflex bleibt aus, auch wenn der Reiz aus dem Magen, dem Darm oder dem Gehirn kommt.",
    ],
    molecules: [
      {
        id: "maropitant",
        legend: [{ k: "a", text: "Das Chinuclidin-Gerüst (bicyclischer Ring mit einem Stickstoff) ist der Kern der Bindung am NK1-Rezeptor." }],
      },
    ],
    know: [
      "Die Halbwertszeit beträgt beim Hund nach Tabletten etwa 4 bis 5,5 Stunden, nach einer Injektion unter die Haut etwa 9 Stunden. Die Wirkung hält etwa 24 Stunden an.",
      "Nebenwirkungen sind selten. Am ehesten treten Speichelfluss, Müdigkeit, Appetitlosigkeit und Durchfall auf. Eine Injektion kann brennen.",
      "Bei Leber- und Herzerkrankungen ist Vorsicht geboten, bei längerer Gabe wird die Leberfunktion überwacht. Mit Calciumkanalblockern (zum Beispiel Verapamil) soll es nicht kombiniert werden.",
    ],
    sources: [WIKI("Maropitant"), { label: "Drugs Used to Control or Stimulate Vomiting (MSD Veterinary Manual)", url: "https://www.msdvetmanual.com/pharmacology/systemic-pharmacotherapeutics-of-the-digestive-system/drugs-used-to-control-or-stimulate-vomiting-in-monogastric-animals" }],
  },
  {
    id: "butorphanol",
    name: "Butorphanol",
    group: "Opioid",
    line: "Beruhigt und lindert Schmerzen",
    glyph: "drop",
    aliases: ["butorphanol", "torbugesic", "dolorex", "butorgesic"],
    brands: ["Torbugesic", "Dolorex"],
    what: "Butorphanol ist ein Opioid aus der Gruppe der Morphinane, das nur Tierärztinnen und Tierärzte anwenden. Bei Hunden nutzt man vor allem die beruhigende Wirkung. Die Schmerzlinderung ist begrenzt.",
    how: [
      "Es bindet an Opioid-Rezeptoren im Nervensystem.",
      "Am κ-Rezeptor (Kappa) wirkt es aktivierend: Das dämpft die Schmerzweiterleitung und beruhigt.",
      "Am μ-Rezeptor (My), dem Hauptziel des Morphins, wirkt es blockierend. Dadurch ist es schwächer als Morphin.",
    ],
    molecules: [
      {
        id: "butorphanol",
        legend: [{ k: "a", text: "Die Cyclobutylmethyl-Gruppe am Stickstoff bestimmt das Wirkprofil: aktivierend am κ-Rezeptor, blockierend am μ-Rezeptor." }],
      },
    ],
    know: [
      "Es wird meist gespritzt. Als Tierarzneimittel ist es für Pferd, Hund und Katze zugelassen und rezeptpflichtig.",
      "Typisch sind Beruhigung und Müdigkeit nach der Gabe. Sehr selten kommen eine verflachte Atmung und ein verlangsamter Herzschlag vor.",
      "Es dämpft den Husten. Bei obstruktiven Atemwegs-, Herz- und Krampfleiden sowie schweren Leber- und Nierenstörungen ist es nicht geeignet. Mit schleimlösenden Mitteln soll es nicht kombiniert werden, weil sich Schleim ansammeln kann.",
    ],
    sources: [WIKI("Butorphanol")],
  },
  {
    id: "sterofundin",
    name: "Sterofundin ISO",
    group: "Infusionslösung",
    line: "Ersetzt Flüssigkeit und Mineralstoffe",
    glyph: "drop",
    aliases: ["sterofundin"],
    what: "Sterofundin ISO ist eine Infusionslösung, deren Salze dem Blutplasma nachempfunden sind (Vollelektrolytlösung). Sie ersetzt Flüssigkeit und Mineralstoffe, zum Beispiel bei Flüssigkeitsmangel (Dehydratation).",
    how: [
      "Die Lösung läuft über einen Venenkatheter ins Blut. Sie enthält Natrium, Kalium, Calcium, Magnesium und Chlorid in ähnlicher Zusammensetzung wie das Blutplasma, mit etwas mehr Chlorid.",
      "Das Wasser verteilt sich aus dem Gefäßsystem in den Raum zwischen den Zellen und gleicht dort den Flüssigkeitsmangel aus.",
      "Acetat und Malat werden in vielen Geweben (Muskel, Herz, Leber, Niere) über den Citratzyklus abgebaut. Dabei entsteht Hydrogencarbonat, das puffert und eine Übersäuerung (Azidose) ausgleicht.",
    ],
    molecules: [
      { id: "natriumchlorid", title: "Natriumchlorid", note: "Hauptbestandteil: 6,8 g je Liter." },
      { id: "acetat", title: "Acetat", note: "Puffer: wird im Stoffwechsel zu Hydrogencarbonat umgebaut." },
      { id: "malat", title: "Malat", note: "Salz der Äpfelsäure, ebenfalls ein Puffer." },
    ],
    facts: {
      title: "Zusammensetzung je Liter",
      rows: [
        { label: "Natrium", value: "145 mmol" },
        { label: "Kalium", value: "4 mmol" },
        { label: "Calcium", value: "2,5 mmol" },
        { label: "Magnesium", value: "1 mmol" },
        { label: "Chlorid", value: "127 mmol" },
        { label: "Acetat", value: "24 mmol" },
        { label: "Malat", value: "5 mmol" },
      ],
    },
    know: [
      "Elektrolytlösungen verbleiben nur kurz im Gefäßsystem. Große Blutverluste lassen sich damit nur eingeschränkt ausgleichen.",
      "Zu viel Flüssigkeit belastet Herz und Lunge. Bei Herzschwäche mit Wassereinlagerungen, schwerer Niereninsuffizienz und unter Cortison ist besondere Vorsicht nötig. Menge und Dauer der Infusion legt die Klinik fest.",
      "Die Lösung wird als Infusion in die Vene gegeben, nicht unter die Haut.",
    ],
    sources: [
      { label: "Sterofundin ISO, Fachinformation (B. Braun, fachinfo.de)", url: "https://fachinfo.de/pdf/009234" },
      { label: "Sterofundin ISO B. Braun Vet Care für Hunde und Katzen, Gebrauchsinformation (Medikamio)", url: "https://medikamio.com/de-de/medikamente/sterofundin-iso-b-braun-vet-care-infusionslosung-fur-rinder-pferde-schafe-ziegen-schweine-hunde-und-katzen/pil" },
    ],
  },
  {
    id: "pimobendan",
    name: "Pimobendan",
    group: "Herzmittel",
    line: "Stärkt den Herzmuskel und entlastet das Herz",
    glyph: "capsule",
    aliases: ["pimobendan", "vetmedin", "cardisure"],
    brands: ["Vetmedin", "Cardisure"],
    what: "Pimobendan ist ein Herzmittel, das in der EU nur als Tierarzneimittel für Hunde zugelassen ist. Es kräftigt die Pumpleistung des Herzens und weitet zugleich die Blutgefäße (Inodilatator).",
    how: [
      "Es macht die Herzmuskelfasern empfindlicher für Calcium (Calcium-Sensitizer). Der Muskel zieht sich bei gleichem Calciumangebot kräftiger zusammen.",
      "Zusätzlich hemmt es das Enzym Phosphodiesterase 3. Das verstärkt die Kontraktion und erweitert Arterien und Venen.",
      "Das Herz pumpt stärker und arbeitet gegen weniger Widerstand.",
    ],
    molecules: [
      {
        id: "pimobendan",
        legend: [{ k: "a", text: "Der Pyridazinon-Ring (Sechsring mit zwei benachbarten Stickstoffatomen) ist typisch für Hemmer der Phosphodiesterase 3." }],
      },
    ],
    know: [
      "Bei Hunden mit Mitralklappenerkrankung hat es die Überlebenszeit verlängert. Bei der dilatativen Kardiomyopathie gilt es als Mittel der ersten Wahl.",
      "Selten sind eine leicht erhöhte Herzfrequenz, Erbrechen, Durchfall und Müdigkeit beschrieben, sehr selten Blutungszeichen wie punktförmige Hautblutungen.",
      "Nicht geeignet ist es bei hypertropher Kardiomyopathie, bei Verengungen des Herzausgangs (zum Beispiel Aortenstenose) und bei schwerer Leberschwäche.",
    ],
    sources: [WIKI("Pimobendan")],
  },
  {
    id: "milbemycinoxim-praziquantel",
    name: "Milbemycinoxim und Praziquantel",
    group: "Wurmmittel",
    line: "Wirkt gegen Rund- und Bandwürmer",
    glyph: "capsule",
    aliases: ["milbemax", "milbemycinoxim", "milbemycin", "praziquantel"],
    similar: ["milbenin"],
    brands: ["Milbemax"],
    what: "Milbemax enthält zwei Wirkstoffe: Milbemycinoxim wirkt gegen Fadenwürmer, Praziquantel gegen Bandwürmer. Zusammen decken sie ein breites Spektrum an Würmern ab.",
    how: [
      "Milbemycinoxim bindet an Glutamat- und GABA-gesteuerte Chloridkanäle in den Nerven- und Muskelzellen der Würmer. Chlorid strömt ein, und die Zellen leiten keine Signale mehr weiter.",
      "Die Würmer erschlaffen und werden mit dem Kot ausgeschieden.",
      "Praziquantel öffnet Calciumkanäle in der Körperhülle der Bandwürmer. Ihre Muskeln verkrampfen, und die Würmer sterben ab.",
    ],
    molecules: [
      {
        id: "milbemycinoxim",
        title: "Milbemycinoxim",
        legend: [{ k: "a", text: "Die Oxim-Gruppe (C=N–OH) ist die chemische Abwandlung gegenüber dem Naturstoff Milbemycin." }],
      },
      {
        id: "praziquantel",
        title: "Praziquantel",
        legend: [{ k: "a", text: "Markiert ist der Cyclohexancarbonyl-Rest. Der Rest des Moleküls ist ein Gerüst aus drei verbundenen Ringen." }],
      },
    ],
    know: [
      "Milbemycine sind Naturstoffe von Bodenbakterien (Streptomyces). Milbemycinoxim ist eine abgewandelte Form davon.",
      "Sehr selten sind Erbrechen, Durchfall, Appetitlosigkeit, Speicheln, Müdigkeit, Muskelzittern und Gangunsicherheit beschrieben.",
    ],
    sources: [WIKI("Milbemycin"), WIKI("Praziquantel")],
  },
  {
    id: "imidacloprid-moxidectin",
    name: "Imidacloprid und Moxidectin",
    group: "Spot-on gegen Parasiten",
    line: "Wirkt gegen Flöhe, Milben und Würmer",
    glyph: "drop",
    aliases: ["advocate", "imidacloprid", "moxidectin"],
    brands: ["Advocate"],
    what: "Advocate ist ein Spot-on, das auf die Haut getropft wird. Imidacloprid wirkt gegen Flöhe, Moxidectin gegen Milben und Fadenwürmer.",
    how: [
      "Imidacloprid ahmt den Botenstoff Acetylcholin nach und besetzt dessen Rezeptoren in den Nervenzellen der Insekten. Anders als Acetylcholin wird es nicht abgebaut. Die Nerven bleiben dauererregt, und der Floh wird gelähmt.",
      "Moxidectin erhöht in Nerven- und Muskelzellen von Würmern und Milben die Durchlässigkeit für Chlorid. Die Zellen sind nicht mehr erregbar, und die Parasiten erschlaffen.",
      "Beide Stoffe verteilen sich über die Haut. Moxidectin wird zusätzlich über die Haut aufgenommen und erreicht so auch Parasiten im Körper.",
    ],
    molecules: [
      {
        id: "imidacloprid",
        title: "Imidacloprid",
        legend: [
          { k: "a", text: "Die Nitroimin-Gruppe (=N–NO₂) bindet an den Acetylcholin-Rezeptor. Insekten-Rezeptoren nehmen sie bevorzugt auf." },
          { k: "b", text: "Der Chlorpyridin-Ring ähnelt dem Pyridinring des Nikotins." },
        ],
      },
      {
        id: "moxidectin",
        title: "Moxidectin",
        legend: [{ k: "a", text: "Die Methoxim-Gruppe (=N–OCH₃) entsteht bei der Abwandlung des Naturstoffs Nemadectin und kennzeichnet Moxidectin." }],
      },
    ],
    know: [
      "Die behandelte Stelle nicht ablecken lassen, auch nicht von anderen Tieren. Das Mittel schmeckt bitter, und bei Rassen mit MDR1-Gendefekt (zum Beispiel Collies) muss jede Aufnahme über das Maul vermieden werden.",
      "Für Wasserorganismen ist Advocate schädlich, Moxidectin hochgiftig. In den ersten vier Tagen nach der Anwendung soll der Hund nicht in offenen Gewässern schwimmen. Reste und leere Pipetten gehören nicht in Gewässer oder den Abfluss.",
    ],
    sources: [WIKI("Imidacloprid"), WIKI("Moxidectin")],
  },
];

export const SUBSTANCE_BY_ID: Record<string, Substance> = Object.fromEntries(SUBSTANCES.map((s) => [s.id, s]));
