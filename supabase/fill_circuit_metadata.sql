-- Fill official_name, country_code and length_km for the 15 non-study circuits.
-- Lengths: last layout used in F1 (Wikipedia "List of Formula One circuits"), same convention as
-- the 10 study circuits. Country codes follow the existing rows (IOC-style, e.g. KSA).
-- Only NULL values are filled, so the study circuits are untouched and the script can be re-run.
update circuits c set
  official_name = coalesce(c.official_name, v.official_name),
  country_code  = coalesce(c.country_code, v.country_code),
  length_km     = coalesce(c.length_km, v.length_km)
from (values
  (6,   'Autodromo Enzo e Dino Ferrari',      'ITA', 4.909),
  (9,   'Circuit of the Americas',            'USA', 5.513),
  (15,  'Circuit de Barcelona-Catalunya',     'ESP', 4.657),
  (22,  'Circuit de Monaco',                  'MON', 3.337),
  (23,  'Circuit Gilles-Villeneuve',          'CAN', 4.361),
  (28,  'Circuit Paul Ricard',                'FRA', 5.842),
  (46,  'Suzuka International Racing Course', 'JPN', 5.807),
  (49,  'Shanghai International Circuit',     'CHN', 5.451),
  (55,  'Circuit Zandvoort',                  'NED', 4.259),
  (63,  'Bahrain International Circuit',      'BRN', 5.412),
  (65,  'Autódromo Hermanos Rodríguez',       'MEX', 4.304),
  (70,  'Yas Marina Circuit',                 'UAE', 5.281),
  (150, 'Lusail International Circuit',       'QAT', 5.419),
  (151, 'Miami International Autodrome',      'USA', 5.412),
  (152, 'Las Vegas Strip Circuit',            'USA', 6.201)
) as v(circuit_key, official_name, country_code, length_km)
where c.circuit_key = v.circuit_key;
