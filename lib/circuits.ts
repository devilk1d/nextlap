// Short qualitative notes for the study circuits, keyed by dataset `CircuitShortName`.
const CHARACTER: Record<string, string> = {
  Monza: "High-speed circuit · very high top speeds",
  Baku: "High-speed street circuit · long straights and tight corners",
  Jeddah: "Fast street circuit with many corners",
  Hungaroring: "Technical circuit · many low-speed corners",
  "Spa-Francorchamps": "High-speed circuit · extreme elevation change",
  Spielberg: "Short lap at high elevation",
  Interlagos: "Elevation change and high altitude",
  Silverstone: "High-speed circuit · high tyre degradation",
  Singapore: "Street circuit · night race, high downforce",
  Melbourne: "Semi-street park circuit",
};

export const circuitCharacter = (shortName: string): string | null => CHARACTER[shortName] ?? null;
