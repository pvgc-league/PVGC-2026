// PVGC League Champions — year over year, from the club trophy.
// Names as recorded; older years predate current league data so only
// surnames are known for some. `winsFor` matches a current-roster
// player to their trophy count by surname.
const CHAMPIONS = [
  { year: 1999, names: ["Cerruti", "Cuneen"] },
  { year: 2000, names: ["Coyne", "Hindley"] },
  { year: 2001, names: ["Carey", "Green"] },
  { year: 2002, names: ["Barker", "McPoyle"] },
  { year: 2003, names: ["Barker", "McPoyle"] },
  { year: 2004, names: ["Carey", "Bartosh"] },
  { year: 2005, names: ["Gant", "Sanson"] },
  { year: 2006, names: ["Lightbody", "Posey"] },
  { year: 2007, names: ["Lightbody", "Posey", "Charles"] },
  { year: 2008, names: ["Lightbody", "Posey"] },
  { year: 2009, names: ["Burns", "Johnston"] },
  { year: 2010, names: ["Lightbody", "Posey"] },
  { year: 2011, names: ["Gehrke", "Larson"] },
  { year: 2012, names: ["Charles", "Adler"] },
  { year: 2013, names: ["Charles", "Adler"] },
  { year: 2014, names: ["Coyne", "Franks"] },
  { year: 2015, names: ["Wagner", "Hammond"] },
  { year: 2016, names: ["Boland Sr", "Boland Jr"] },
  { year: 2017, names: ["Herman", "West"] },
  { year: 2018, names: ["Harvey", "Rowles"] },
  { year: 2019, names: ["Saenz", "Huston"] },
  { year: 2020, names: ["Saenz", "Huston"] },
  { year: 2021, names: ["Harvey", "Rowles"] },
  { year: 2022, names: ["Deshaies", "Glascott"] },
  { year: 2023, names: ["Brosius", "Albano"] },
  { year: 2024, names: ["Brosius", "Albano"] },
  { year: 2025, names: ["Charles", "Dagg"] },
  { year: 2026, names: ["Carickhoff", "Schantz"] },
];

function surname(full) {
  const parts = (full || "").trim().split(/\s+/);
  return (parts[parts.length - 1] || "").toLowerCase();
}

// Count of championship years where `fullName`'s surname appears.
function winsFor(fullName) {
  const sn = surname(fullName);
  if (!sn) return 0;
  return CHAMPIONS.filter(c => c.names.some(n => surname(n) === sn)).length;
}

// Years won, most recent first — for the profile page detail.
function winYearsFor(fullName) {
  const sn = surname(fullName);
  if (!sn) return [];
  return CHAMPIONS.filter(c => c.names.some(n => surname(n) === sn)).map(c => c.year).sort((a, b) => b - a);
}

export { CHAMPIONS, winsFor, winYearsFor };
