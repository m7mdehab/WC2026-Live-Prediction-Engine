// World Cup facts pool. Verified June 2026 against FIFA, Guinness World Records,
// Britannica, Olympics.com, Sports Mole and tournament sources. Mix of genuine
// facts and "commonly misremembered" (Mandela-effect) entries.
// PM-curated; will grow to 50+. The DidYouKnow consumer takes any length, shuffles
// per session, and never repeats until the pool is exhausted. Do not generate more here.
export type Fact = { kind: "fact" | "misremembered"; text: string };

export const FACTS_2026: Fact[] = [
  // --- 2026 ---
  { kind: "fact", text: "The 2026 World Cup is the first with 48 teams and 104 matches, the largest in the tournament's history." },
  { kind: "fact", text: "2026 is the first World Cup co-hosted by three nations: the United States, Canada and Mexico, across 16 cities and 39 days." },
  { kind: "fact", text: "The opener is Mexico vs South Africa at Mexico City's Estadio Azteca, the first stadium ever to host games at three different men's World Cups (1970, 1986, 2026)." },
  { kind: "fact", text: "The 2026 final is at MetLife Stadium in New York/New Jersey on 19 July, and will feature the first half-time show in World Cup final history." },
  { kind: "fact", text: "2026 introduces a brand-new knockout round, the Round of 32, with the eight best third-placed teams advancing alongside the group winners and runners-up." },

  // --- Records ---
  { kind: "fact", text: "Miroslav Klose is the all-time top World Cup scorer, with 16 goals across four tournaments (2002–2014)." },
  { kind: "fact", text: "Just Fontaine's 13 goals at a single World Cup, in only six matches in 1958, has never been beaten." },
  { kind: "fact", text: "Oleg Salenko is the only player to score five goals in one World Cup match, for Russia against Cameroon in 1994." },
  { kind: "fact", text: "Pelé is the only player to win three World Cups (1958, 1962 and 1970)." },
  { kind: "fact", text: "Lionel Messi has played more World Cup matches than anyone else, with 26." },
  { kind: "fact", text: "Brazil is the only nation to appear at every World Cup, and has won the most titles, with five." },
  { kind: "fact", text: "Only eight nations have ever won the men's World Cup." },
  { kind: "fact", text: "Germany is the all-time top-scoring nation in World Cup history, with more than 230 goals." },
  { kind: "fact", text: "Turkey's Hakan Şükür scored the fastest goal in World Cup history, after just 10.8 seconds, in the 2002 third-place match." },
  { kind: "fact", text: "The highest-scoring match in World Cup history was Austria 7–5 Switzerland in 1954, twelve goals in one game." },
  { kind: "fact", text: "Hungary once beat South Korea 9–0 (1954), among the biggest wins in World Cup history." },
  { kind: "fact", text: "The 1950 final at the Maracanã drew 173,850 fans, still the largest crowd ever at a World Cup match." },
  { kind: "fact", text: "Egypt's Essam El-Hadary became the oldest player in World Cup history in 2018, aged 45 years and 161 days." },
  { kind: "fact", text: "Northern Ireland's Norman Whiteside is the youngest player ever at a World Cup, at 17 years and 41 days, in 1982." },
  { kind: "fact", text: "Pelé is the youngest player ever to score at a World Cup, aged 17 in 1958." },
  { kind: "fact", text: "Cafu of Brazil is the only player to appear in three consecutive World Cup finals (1994, 1998 and 2002)." },
  { kind: "fact", text: "Vittorio Pozzo of Italy is the only manager to win the World Cup twice, in 1934 and 1938." },
  { kind: "fact", text: "Geoff Hurst's hat-trick in the 1966 final stood alone for 56 years, until Kylian Mbappé scored one in the 2022 final." },
  { kind: "fact", text: "Peter Shilton and Fabien Barthez share the record for most World Cup clean sheets, with 10 each." },
  { kind: "fact", text: "Mexico's Antonio Carbajal was the first player to appear at five World Cups (1950–1966)." },
  { kind: "fact", text: "Lothar Matthäus held the record for most World Cup matches (25) until Messi passed him in 2022." },
  { kind: "fact", text: "Ronaldo of Brazil sits second on the all-time scoring list with 15 goals, and was the top scorer of the 2002 tournament." },

  // --- History & firsts ---
  { kind: "fact", text: "The first World Cup, in 1930, was hosted and won by Uruguay." },
  { kind: "fact", text: "Only 13 teams entered the 1930 World Cup, as several European sides refused the long boat journey to South America." },
  { kind: "fact", text: "Italy were the first nation to win back-to-back World Cups, in 1934 and 1938." },
  { kind: "fact", text: "No World Cup was held in 1942 or 1946, because of the Second World War." },
  { kind: "fact", text: "Brazil were the first team to win a World Cup on another continent, in Sweden in 1958." },
  { kind: "fact", text: "West Germany's shock 1954 win over Hungary's 'Golden Team' is remembered as the 'Miracle of Bern'." },
  { kind: "fact", text: "The 1954 World Cup is still the highest-scoring ever by average, at about 5.4 goals per game." },
  { kind: "fact", text: "2002, co-hosted by South Korea and Japan, was the first World Cup held in two countries, and the first in Asia." },
  { kind: "fact", text: "Qatar 2022 was the first World Cup played in winter, in November and December." },
  { kind: "fact", text: "Morocco became the first African nation to reach a World Cup semi-final, in 2022." },
  { kind: "fact", text: "Germany beat hosts Brazil 7–1 in the 2014 semi-final, then won the trophy on a Mario Götze extra-time goal." },
  { kind: "fact", text: "The trophy lifted today is 18-carat gold and weighs about six kilograms." },
  { kind: "fact", text: "The current trophy dates from 1974, after Brazil were allowed to keep the original Jules Rimet trophy for winning three times." },
  { kind: "fact", text: "In 1966 the Jules Rimet trophy was stolen in London, and found a week later under a hedge by a dog named Pickles." },
  { kind: "fact", text: "Lucien Laurent of France scored the very first goal in World Cup history, in 1930." },
  { kind: "fact", text: "The World Cup is the most-watched sporting event on Earth, reaching billions of viewers across a tournament." },

  // --- Commonly misremembered (Mandela effect) ---
  { kind: "misremembered", text: "Many 'remember' Brazil lifting the trophy at home in 1950, but in fact they lost the decisive match to Uruguay, the 'Maracanazo'." },
  { kind: "misremembered", text: "The 1950 World Cup had no actual final. The title was settled by a final group, which is why Uruguay's win over Brazil is so often misremembered as 'the final'." },
  { kind: "misremembered", text: "Maradona's 1986 'Hand of God' is often recalled as disallowed, but it stood, and England were knocked out." },
  { kind: "misremembered", text: "The 'Goal of the Century' and the 'Hand of God' happened in the same 1986 match, Argentina vs England, though they're often remembered as separate games." },
  { kind: "misremembered", text: "People often think Pelé won a World Cup Golden Boot as top scorer, but he never did." },
  { kind: "misremembered", text: "Zidane's 2006 headbutt is widely remembered as getting France thrown out of the final. He was sent off, but France played on and lost on penalties." },
  { kind: "misremembered", text: "The popular story that India were banned from the 1950 World Cup for wanting to play barefoot is a myth. They withdrew on their own, mainly over cost and travel." },
  { kind: "misremembered", text: "England's 1966 'ghost goal' off the crossbar is often recalled as clearly over the line, but whether it actually crossed is still disputed." },
  { kind: "misremembered", text: "Hakan Şükür's 'fastest goal' is often exaggerated in the retelling. The real time was 10.8 seconds, not the two or three people remember." },
];
