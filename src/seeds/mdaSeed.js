/**
 * AssetSpatial — MDA Seed Data
 * 31 Federal MDAs extracted from the Inventory of Public Buildings XLS
 * Run via: node seeds/seedMdas.js
 * Or called automatically on first startup if collection is empty.
 */

const MDA_SEED = [
  { name: 'Federal Ministry of Works and Housing',                                     shortName: 'FMWH',   category: 'Ministry'    },
  { name: 'Federal Ministry of Agriculture and Rural Development',                     shortName: 'FMARD',  category: 'Ministry'    },
  { name: 'Federal Ministry of Labour and Employment',                                 shortName: 'FMLE',   category: 'Ministry'    },
  { name: 'Federal Ministry of Communication and Digital Economy',                     shortName: 'FMCDE',  category: 'Ministry'    },
  { name: 'Federal Ministry of Environment',                                           shortName: 'FMEnv',  category: 'Ministry'    },
  { name: 'Public Complaints Commission',                                              shortName: 'PCC',    category: 'Commission'  },
  { name: 'Federal Judiciary',                                                         shortName: 'FJ',     category: 'Department'  },
  { name: 'Federal Road Safety Corps',                                                 shortName: 'FRSC',   category: 'Agency'      },
  { name: 'Federal Ministry of Health',                                                shortName: 'FMH',    category: 'Ministry'    },
  { name: 'Independent Corrupt Practices and Other Related Offences Commission (ICPC)',shortName: 'ICPC',   category: 'Commission'  },
  { name: 'Federal Ministry of Education',                                             shortName: 'FME',    category: 'Ministry'    },
  { name: 'Economic and Financial Crimes Commission (EFCC)',                           shortName: 'EFCC',   category: 'Commission'  },
  { name: 'Independent National Electoral Commission (INEC)',                          shortName: 'INEC',   category: 'Commission'  },
  { name: 'Federal Ministry of Budget and National Planning',                          shortName: 'FMBNP',  category: 'Ministry'    },
  { name: 'Federal Ministry of Finance',                                               shortName: 'FMF',    category: 'Ministry'    },
  { name: 'Federal Ministry of Foreign Affairs',                                       shortName: 'FMFA',   category: 'Ministry'    },
  { name: 'Federal Ministry of Defence',                                               shortName: 'FMD',    category: 'Ministry'    },
  { name: 'National Assembly',                                                         shortName: 'NASS',   category: 'Department'  },
  { name: 'Presidency',                                                                shortName: 'PRES',   category: 'Department'  },
  { name: 'Federal Ministry of Science and Technology',                                shortName: 'FMST',   category: 'Ministry'    },
  { name: 'Ministry of Water Resources',                                               shortName: 'MWR',    category: 'Ministry'    },
  { name: 'Ministry of Mines and Steel Development',                                   shortName: 'MMSD',   category: 'Ministry'    },
  { name: 'Ministry of Transport',                                                     shortName: 'MT',     category: 'Ministry'    },
  { name: 'Federal Ministry of Power',                                                 shortName: 'FMP',    category: 'Ministry'    },
  { name: 'Federal Ministry of Niger Delta',                                           shortName: 'FMND',   category: 'Ministry'    },
  { name: 'Federal Ministry of Petroleum Resources',                                   shortName: 'FMPR',   category: 'Ministry'    },
  { name: 'Federal Ministry of Sports and Youth Development',                          shortName: 'FMSYD',  category: 'Ministry'    },
  { name: 'Federal Ministry of Women Affairs',                                         shortName: 'FMWA',   category: 'Ministry'    },
  { name: 'Federal Ministry of Industry, Trade and Investment',                        shortName: 'FMITI',  category: 'Ministry'    },
  { name: 'Federal Ministry of Information and Culture',                               shortName: 'FMIC',   category: 'Ministry'    },
  { name: 'Central Bank of Nigeria (CBN)',                                             shortName: 'CBN',    category: 'Agency'      },
];

module.exports = MDA_SEED;