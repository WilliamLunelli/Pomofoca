# Sons de fundo do timer

A UI de seleção de som já está implementada (`TimerPage.tsx`, card "Som de fundo"),
mas os arquivos de áudio ainda não existem. Assim que você tiver as trilhas, coloque
aqui exatamente com estes nomes (o código já referencia esses caminhos):

- `rain.mp3` — Chuva
- `lofi.mp3` — Lo-fi
- `white-noise.mp3` — Ruído branco

(`Silêncio` é a opção padrão e não precisa de arquivo — nenhum áudio toca.)

## Requisitos técnicos

- Formato **MP3**, em **loop perfeito** (sem clique/pop na emenda do fim pro
  início) — o código toca com `loop` nativo do `<audio>`, então qualquer descontinuidade
  na trilha vai ficar audível a cada repetição.
- Idealmente **1-3 minutos** de duração (loops muito curtos ficam repetitivos rápido
  demais; muito longos deixam o app pesado pra baixar/cachear no PWA).
- Tamanho de arquivo razoável (mira em ~1-3MB cada) — esses arquivos entram no
  precache do service worker (`vite-plugin-pwa`), então ficam disponíveis offline,
  mas também aumentam o tamanho do que é baixado na primeira visita.
- Licença: use trilhas livres de direitos autorais para uso comercial (o Pomofoca é
  um produto pago) — ex: bibliotecas de música royalty-free, ou produção própria.

Depois de colocar os arquivos aqui, nenhuma mudança de código é necessária — o
`<audio>` em `TimerPage.tsx` já aponta pra `/sounds/<nome>.mp3` e só falha
silenciosamente enquanto o arquivo não existir.
