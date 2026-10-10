# Views que não parecem humanas

A marca paga o criador por alcance. Pico comprado, repetição mecânica e queda abrupta inflam esse número. Acusar um criador honesto, porém, também custa caro. Esta API recebe uma série de views por hora e devolve três coisas: uma classificação, um motivo que dá para ler sem conhecer o código e os sinais usados na decisão.

O classificador é um conjunto de regras com limiares fixos, sem modelo treinado. Ele parte de um princípio simples: **audiência humana não é mais regular do que o acaso**. Quando o padrão não basta para acusar, o classificador prefere responder `inconclusivo`.

| Classificação | O que significa |
| --- | --- |
| `suspeito` | Uma combinação documentada de sinais de entrega programada. Pede revisão; não é prova de fraude. |
| `inconclusivo` | Há uma anomalia, mas ela também tem explicação legítima, ou falta contexto. O classificador prefere não acusar. |
| `sem_indicios` | As regras não acharam sinais de entrega mecânica. Isso não prova que as views são humanas. |

## Como rodar

Node 22 ou mais novo.

```bash
npm install
npm test                             # testes, incluindo o que confere a taxa publicada aqui
npm run evaluate                     # gera o dataset, mede as taxas e avisa se o README divergir
npm run evaluate -- --write-readme   # o mesmo e reescreve os blocos gerados deste README
npm run calibrate -- --grid          # métricas no conjunto de calibração e variações dos limiares
npm run dev                          # API em http://127.0.0.1:3003
```

```bash
curl -s -X POST localhost:3003/v1/classify \
  -H 'content-type: application/json' \
  -d '{"views": [120, 98, 131, 110, 125, 104]}'
```

Essa série tem só 6 horas, então a resposta é `inconclusivo` com o motivo "falta histórico". A resposta completa de uma série de 72 horas está na seção [Quando o classificador prefere não acusar](#quando-o-classificador-prefere-não-acusar).

## Contrato da API

`GET /health` responde `{"status":"ok","rules_version":"…"}`.

`POST /v1/classify` recebe `{"views": [...]}`:

- **Formato da série.** Cada posição traz as views recebidas naquela hora, em ordem cronológica. Não são totais acumulados. Zero significa zero views, não dado ausente.
- **Numeração das horas.** A hora 1 é a primeira posição do array. A resposta e o motivo usam essa numeração.
- **Limites.** De 1 a 720 horas, com inteiros de 0 a 1.000.000.000. O corpo aceita no máximo 64 KiB.
- **Erros.** JSON malformado recebe `400`, com `error` igual a `json_invalido`. Campo extra, tipo errado, fração, negativo, `null`, lista vazia ou longa demais recebem `400`, com `error` igual a `entrada_invalida` e `field` indicando o problema, por exemplo `views[3]`. Corpo grande demais recebe `413`.
- **Série curta.** Com menos de 24 horas, a resposta é `200` e `inconclusivo`.

Campos da resposta:

| Campo | Conteúdo |
| --- | --- |
| `classification` | `suspeito`, `inconclusivo` ou `sem_indicios` |
| `reason` | Motivo em português, montado com os mesmos números dos sinais |
| `event` | O trecho que decidiu: horas, pico, ritmo anterior e views acima desse ritmo |
| `signals` | Todos os sinais avaliados, ativos ou não: valor, limite aplicado, unidade e horas. Sinal que não pôde ser calculado vem com `value: null` e uma `note` explicando por quê |
| `rules_version` | Versão dos limiares que produziu a resposta |

## Como o classificador decide

### O princípio

Mesmo com público estável, acessos independentes variam de uma hora para a outra cerca de √média views: com 5.000 views/h, isso dá cerca de 70. Público real varia ainda mais. Entrega programada varia menos. Por isso, "views fixas" aqui quer dizer **variação menor que a metade da que o acaso produziria naquele volume**.

Um limite fixo em porcentagem puniria justamente o vídeo que estourou: com 20 mil views/h, o próprio acaso varia menos de 1%.

### Eventos

- **Pico:** começa na primeira hora que salta sobre o ritmo anterior e termina quando as views ficam abaixo da metade do pico.
- **Trecho fixo:** uma sequência de horas estáveis que passa no teste de regularidade, mesmo sem pico.
- **Eventos sobrepostos:** pico e trecho fixo que se sobrepõem formam um só evento.
- **Sinais por evento:** usam só as horas do evento, o ritmo anterior e as horas logo depois. Sinais de eventos diferentes nunca se combinam para formar uma acusação.

<!-- regras:inicio -->
_Gerado a partir de `src/classifier/rules.ts` (regras 1.0.0) por `npm run evaluate -- --write-readme`._

| Sinal | Ativa quando | Indisponível quando |
| --- | --- | --- |
| Ritmo anterior | Mediana das até 12 horas antes do evento (mínimo de 6). Nas razões, o ritmo anterior nunca vale menos que 20 views/h. | O evento começa antes da 7ª hora |
| Salto | Pico ≥ 8 × o ritmo anterior e ≥ 200 views. O evento vai da primeira hora que salta até a última com pelo menos 50% do pico. | Sem ritmo anterior |
| Trecho com views fixas | 6 horas ou mais, média ≥ 200 views/h, cada hora a até 2·√mediana da mediana do trecho, e variação típica de uma hora para a outra ≤ 0,5·√média. Variação típica: média das diferenças entre horas seguidas, descartando a maior. Medida no trecho inteiro, nunca na melhor janela dentro dele. | Nenhum trecho estável com 6 horas |
| Volta brusca ao ritmo anterior | Em até 2 horas depois do evento, 3 horas seguidas com no máximo 10% do excesso sobre o ritmo anterior (sem ritmo anterior: 10% do nível do evento). | A série termina antes de 3 horas depois do evento |
| Cauda (informativo) | Mediana das 3 horas depois do pico ≥ 25% do pico. Explica um pico sem acusação; não decide sozinho. | Menos de 3 horas depois do pico |
| Desenho repetido | Desenho de 2 a 6 horas repetido 4 vezes seguidas ou mais, pulso (maior − menor hora do desenho) ≥ 200 views, contraste ≥ 5× e, em cada hora do desenho, diferença média entre as repetições ≤ 5% da altura do pulso. | — |
| Série curta | Menos de 24 horas. | — |
<!-- regras:fim -->

### Ordem de decisão

1. **Série curta:** `inconclusivo`.
2. **Desenho repetido:** `suspeito`. Quando há zero exato entre os pulsos, a resposta é `inconclusivo`, porque esse também é o desenho de um contador que a plataforma atualiza a cada poucas horas.
3. **Cada evento recebe uma classificação:**
   - **Salto, trecho fixo e volta brusca ao ritmo anterior, no mesmo evento:** `suspeito`. É o desenho do pacote comprado: sobe de uma vez, fica fixo e desliga.
   - **Trecho fixo sem a combinação completa:** `inconclusivo`. Isso acontece quando falta ritmo anterior (o trecho começa no lançamento), quando não houve salto ou quando o trecho não desliga antes do fim da série. Regularidade sozinha também aparece em impulsionamento pago.
   - **Pico sem trecho fixo que volta logo ao ritmo anterior:** `inconclusivo`. Compra rápida e menção pontual numa live produzem o mesmo desenho.
   - **Pico perto do fim da série, sem horas suficientes depois:** `inconclusivo`.
   - **Pico sem trecho fixo que não desliga de uma vez:** `sem_indicios`. É o desenho de quem viralizou.
4. **Série:** recebe a classificação mais grave entre os eventos e a repetição. Desempate pelo maior volume acima do ritmo anterior e, depois, pelo mais cedo.

A queda abrupta sozinha não acusa ninguém, porque campanhas, lives e estreias também terminam de uma vez. Ela só pesa junto com salto e trecho fixo no mesmo evento.

## Pico orgânico × pico comprado

As duas séries abaixo têm o mesmo pico, de cerca de 5.000 views/h, e quase o mesmo volume acima do ritmo normal. Muda só o desenho. O teste `test/organic-vs-bought.test.ts` usa exatamente essas séries e confere três coisas: as classificações diferentes, os sinais que mudam e o volume parecido.

<!-- organico-x-comprado:inicio -->
_Gerado por `npm run evaluate -- --write-readme`. Não edite à mão: `test/readme.test.ts` falha se este bloco divergir do código._

#### Pico orgânico: `sem_indicios`

Sobe em três horas até cerca de 5.000 views/h e cai aos poucos. Série de 72 horas:

```text
▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▃▅█▇▇▆▅▅▄▄▄▃▃▃▃▂▂▂▂▂▂▂▂▂▂▂▂▂▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁
```

> Na 32ª hora houve um pico de 5.100 views, 20 vezes o ritmo anterior de 249 por hora, mas a queda foi gradual: nas 3 horas seguintes ainda havia 79% do pico, e o volume só voltou para perto do ritmo anterior 21 horas depois do pico. Esse desenho é compatível com viralização. Isso não prova que as views são humanas; as regras apenas não encontraram sinais de entrega mecânica.

| Sinal | Ativo | Valor | Limite | Horas |
| --- | --- | --- | --- | --- |
| Série curta | não | 72 h | < 24 h | 1–72 |
| Salto sobre o ritmo anterior | sim | 20× | ≥ 8× | 31–37 |
| Trecho com views fixas | não | — | — | — |
| Volta brusca ao ritmo anterior | não | 54,6% | ≤ 10% | 39–41 |
| Cauda depois do pico | sim | 79,2% | ≥ 25% | 33–35 |
| Desenho repetido | não | — | — | — |

#### Pico comprado: `suspeito`

4.750 views/h somadas ao tráfego normal durante 8 horas, depois desliga. Série de 72 horas:

```text
▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████████▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
```

> Entre a 31ª e a 38ª hora, as views ficaram praticamente fixas em cerca de 4.999 por hora (de 4.985 a 5.015). Antes, o ritmo era de 249 por hora: um salto de 20 vezes. Na hora seguinte, as views voltaram a 238 por hora e ficaram assim. Nesse volume, acessos independentes variariam cerca de 71 views de uma hora para a outra; aqui a variação típica foi de 11. O desenho é típico de entrega programada e merece revisão: são cerca de 38.015 views acima do ritmo normal nesse trecho.

| Sinal | Ativo | Valor | Limite | Horas |
| --- | --- | --- | --- | --- |
| Série curta | não | 72 h | < 24 h | 1–72 |
| Salto sobre o ritmo anterior | sim | 20× | ≥ 8× | 31–38 |
| Trecho com views fixas | sim | 11 views | ≤ 35 views | 31–38 |
| Volta brusca ao ritmo anterior | sim | 0,2% | ≤ 10% | 39–41 |
| Cauda depois do pico | não | 4,8% | ≥ 25% | 39–41 |
| Desenho repetido | não | — | — | — |
<!-- organico-x-comprado:fim -->

## Quando o classificador prefere não acusar

Uma rajada de uma hora que volta ao ritmo de antes pode ser compra, mas também pode ser uma menção numa live. Por hora, as duas coisas têm o mesmo desenho, e o classificador responde `inconclusivo`. O dataset tem as duas versões, a legítima (evento curto) e a artificial (rajada), e as métricas mostram que ele se abstém nos dois lados.

<!-- abstencao:inicio -->
_Gerado por `npm run evaluate -- --write-readme`. Não edite à mão: `test/readme.test.ts` falha se este bloco divergir do código._

#### Rajada curta: `inconclusivo`

Uma hora com 6.000 views e volta imediata ao ritmo de antes. Série de 72 horas:

```text
▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
```

> Na 40ª hora, as views saltaram para 6.000, 20 vezes o ritmo anterior de 299 por hora, e voltaram ao patamar de antes na hora seguinte. Esse desenho aparece tanto em compra rápida quanto em uma menção pontual, como uma live ou um compartilhamento grande. Sem trecho fixo nem repetição, não há evidência suficiente para acusar.

| Sinal | Ativo | Valor | Limite | Horas |
| --- | --- | --- | --- | --- |
| Série curta | não | 72 h | < 24 h | 1–72 |
| Salto sobre o ritmo anterior | sim | 20× | ≥ 8× | 40 |
| Trecho com views fixas | não | — | — | — |
| Volta brusca ao ritmo anterior | sim | 0,4% | ≤ 10% | 41–43 |
| Cauda depois do pico | não | 4,9% | ≥ 25% | 41–43 |
| Desenho repetido | não | — | — | — |

<details><summary>Resposta completa da API</summary>

```json
{
  "classification": "inconclusivo",
  "reason": "Na 40ª hora, as views saltaram para 6.000, 20 vezes o ritmo anterior de 299 por hora, e voltaram ao patamar de antes na hora seguinte. Esse desenho aparece tanto em compra rápida quanto em uma menção pontual, como uma live ou um compartilhamento grande. Sem trecho fixo nem repetição, não há evidência suficiente para acusar.",
  "event": {
    "kind": "pico",
    "start_hour": 40,
    "end_hour": 40,
    "peak_hour": 40,
    "peak_views": 6000,
    "baseline_per_hour": 298.5,
    "excess_views": 5702
  },
  "signals": [
    {
      "code": "serie_curta",
      "label": "Série curta",
      "active": false,
      "value": 72,
      "threshold": 24,
      "unit": "horas na série",
      "start_hour": 1,
      "end_hour": 72,
      "note": null,
      "details": null
    },
    {
      "code": "salto",
      "label": "Salto sobre o ritmo anterior",
      "active": true,
      "value": 20.101,
      "threshold": 8,
      "unit": "vezes o ritmo anterior",
      "start_hour": 40,
      "end_hour": 40,
      "note": null,
      "details": {
        "peak_hour": 40,
        "peak_views": 6000,
        "baseline_per_hour": 298.5
      }
    },
    {
      "code": "plato",
      "label": "Trecho com views fixas",
      "active": false,
      "value": null,
      "threshold": null,
      "unit": "views de variação típica entre horas seguidas",
      "start_hour": null,
      "end_hour": null,
      "note": "Nenhum trecho de 6 horas ou mais com volume estável dentro do evento.",
      "details": null
    },
    {
      "code": "queda",
      "label": "Volta brusca ao ritmo anterior",
      "active": true,
      "value": 0.0045,
      "threshold": 0.1,
      "unit": "fração do excesso que sobrou",
      "start_hour": 41,
      "end_hour": 43,
      "note": null,
      "details": {
        "settled_per_hour": 291
      }
    },
    {
      "code": "cauda",
      "label": "Cauda depois do pico",
      "active": false,
      "value": 0.0485,
      "threshold": 0.25,
      "unit": "fração do pico mantida nas horas seguintes",
      "start_hour": 41,
      "end_hour": 43,
      "note": "Informativo: ajuda a explicar um pico sem acusação, mas não decide sozinho.",
      "details": {
        "recovery_hours": 1
      }
    },
    {
      "code": "repeticao",
      "label": "Desenho repetido",
      "active": false,
      "value": null,
      "threshold": null,
      "unit": "maior diferença média entre repetições, em fração da altura do pulso",
      "start_hour": null,
      "end_hour": null,
      "note": "Nenhum desenho de 2 a 6 horas se repetiu 4 vezes seguidas com pulso de pelo menos 200 views e contraste de 5 vezes.",
      "details": null
    }
  ],
  "rules_version": "1.0.0"
}
```

</details>
<!-- abstencao:fim -->

## Dataset sintético

`npm run evaluate` gera `data/dataset.jsonl`, com um registro por série (`id`, `family`, `label`, `seed`, `views`), e `data/manifest.json`, com seed, quantidades, versão do gerador e SHA-256 do arquivo. O classificador recebe só `views`, nunca a família nem o rótulo.

- **Reproduzível.** O PRNG (mulberry32) está no próprio repositório. A seed de cada série deriva da seed base, da família e da posição. Nada usa `Math.random()`, relógio ou rede. Rodar o comando de novo produz o mesmo arquivo, byte a byte, e `test/dataset.test.ts` confere o SHA-256.
- **Ruído de público real.** As séries legítimas somam chegadas independentes (Poisson) a uma variação extra de hora para hora, porque audiência real oscila mais que o acaso.
- **Cenário de estresse.** As mesmas séries legítimas são geradas com ruído de Poisson puro, o caso menos favorável às regras de regularidade. A taxa medida nesse cenário sai ao lado da principal, para mostrar quanto o resultado depende da escolha do ruído.
- **Calibração separada.** Os limiares foram escolhidos num conjunto com outra seed (`npm run calibrate -- --grid`). Só depois de congelar as regras rodei o conjunto de avaliação.

Na calibração, testei um segundo critério de regularidade: "o volume subiu muito, mas a variação continuou do tamanho da de antes". Ele detectava mais pacotes somados a tráfego real, mas acusava campanhas pagas legítimas. Fiquei só com o critério do acaso, porque o desafio pede para não punir criador honesto.

<!-- familias:inicio -->
| Família | Origem | Desenho | Esperado (hipótese) | Papel |
| --- | --- | --- | --- | --- |
| Ciclo diário | Legítima | Ritmo de 24 horas com variação de público real | `sem_indicios` | Base |
| Viral | Legítima | Subida irregular e cauda longa, no meio da série ou logo no lançamento | `sem_indicios` | Par do pacote comprado |
| Evento curto | Legítima | Pico de 1 a 2 horas e volta ao ritmo de antes (menção em live ou TV) | `inconclusivo` | Abstenção |
| Campanha estável | Legítima | Impulsionamento pago com ritmo quase constante e fim marcado; em parte das séries a plataforma entrega um teto fixo de exibições por hora e conta a view no autoplay | `sem_indicios` ou `inconclusivo` | Caso difícil e principal fonte esperada de falso positivo |
| Baixo volume | Legítima | Poucas views por hora, com muitos zeros | `sem_indicios` | Proteção contra repetição trivial |
| Ondas | Legítima | Várias divulgações ao longo da série, cada uma com cauda | `sem_indicios` | Vários eventos na mesma série |
| Contador em lotes | Legítima | Tráfego real, mas a plataforma só atualiza o contador a cada 2 a 6 horas | `inconclusivo` | Erro de coleta que parece pulso |
| Pacote | Artificial | Quantidade fixa por hora somada ao tráfego normal, por 6 a 24 horas, depois desliga | `suspeito` | Par do viral |
| Pulsos | Artificial | Pulsos iguais a cada 2 a 6 horas | `suspeito` | Repetição |
| Blocos | Artificial | Um desenho de 2 a 6 horas repetido várias vezes | `suspeito` | Repetição |
| Compra no lançamento | Artificial | Quantidade fixa por hora desde a primeira hora da série, depois desliga | `inconclusivo` | Ponto cego: não há ritmo anterior para comparar |
| Rajada | Artificial | Pico comprado de 1 a 2 horas e volta imediata, igual ao evento curto | `inconclusivo` | O classificador se abstém dos dois lados |
| Compra disfarçada | Artificial | Compra com oscilação de público real, em ritmo constante ou com desenho de viral | `sem_indicios` ou `inconclusivo` | Ponto cego documentado |
<!-- familias:fim -->

## Métricas

```text
taxa de falso positivo = séries legítimas classificadas como suspeito / total de séries legítimas
```

As legítimas classificadas como `inconclusivo` continuam no denominador. A tabela mostra ainda a versão pessimista, que conta inconclusivo como acusação, para deixar visível o custo da abstenção. A taxa vale para este dataset sintético; ela não estima o desempenho em redes sociais reais.

<!-- metricas:inicio -->
_Gerado por `npm run evaluate -- --write-readme`. Não edite à mão: `test/readme.test.ts` falha se este bloco divergir do código._

Dataset de avaliação: 2.600 séries (13 famílias × 200), seed 20261010, gerador 1.0.0, SHA-256 `8015dc3a100cc8b8`. Regras 1.0.0.

**Taxa de falso positivo: 14 de 1.400 séries legítimas classificadas como `suspeito` (1,00%; IC 95%: 0,60% a 1,67%).**

| Métrica | Resultado | IC 95% (Wilson) |
| --- | --- | --- |
| Falso positivo: legítimas classificadas como `suspeito` | 14 de 1.400 (1,00%) | 0,60% a 1,67% |
| Legítimas classificadas como `inconclusivo` | 497 de 1.400 (35,50%) | 33,04% a 38,04% |
| Falso positivo pessimista: legítimas `suspeito` ou `inconclusivo` | 511 de 1.400 (36,50%) | 34,02% a 39,06% |
| Detecção: artificiais classificadas como `suspeito` | 500 de 1.200 (41,67%) | 38,91% a 44,48% |
| Precisão: entre as `suspeito`, quantas eram artificiais | 500 de 514 (97,28%) | 95,48% a 98,37% |
| Falso positivo no estresse: legítimas com ruído de Poisson puro | 22 de 1.400 (1,57%) | 1,04% a 2,37% |

| Família | Origem | `sem_indicios` | `inconclusivo` | `suspeito` |
| --- | --- | --- | --- | --- |
| Ciclo diário | Legítima | 198 | 2 | 0 |
| Viral | Legítima | 195 | 5 | 0 |
| Evento curto | Legítima | 12 | 188 | 0 |
| Campanha estável | Legítima | 64 | 122 | 14 |
| Baixo volume | Legítima | 200 | 0 | 0 |
| Ondas | Legítima | 197 | 3 | 0 |
| Contador em lotes | Legítima | 23 | 177 | 0 |
| Pacote | Artificial | 11 | 89 | 100 |
| Pulsos | Artificial | 0 | 0 | 200 |
| Blocos | Artificial | 0 | 0 | 200 |
| Compra no lançamento | Artificial | 30 | 170 | 0 |
| Rajada | Artificial | 2 | 198 | 0 |
| Compra disfarçada | Artificial | 88 | 112 | 0 |

Falsos positivos por família: Campanha estável (14).
<!-- metricas:fim -->

**Como ler a detecção.** Das seis famílias artificiais, três foram feitas para não serem acusadas:

- **Compra no lançamento:** não há ritmo anterior para comparar.
- **Rajada:** tem o mesmo desenho de um evento legítimo curto.
- **Compra disfarçada:** imita o ruído humano.

Elas existem para medir os pontos cegos, e não para inflar a detecção.

## O que o critério não detecta

- **Compra que imita a curva orgânica**, com subida, cauda e oscilação de público real.
- **Compra somada a tráfego real que oscila mais que o acaso.** A oscilação do tráfego real esconde a regularidade da compra, e o caso costuma virar `inconclusivo` (volta brusca sem trecho fixo).
- **Compra diluída:** gradual ao longo de dias, ou menor que o salto mínimo sobre o ritmo anterior.
- **Compra no lançamento.** Sem ritmo anterior, o máximo que ela recebe é `inconclusivo`.
- **Rajadas de 1 a 2 horas,** que sempre ficam como `inconclusivo`.
- **Desenhos repetidos com período maior que 6 horas** ou com menos de 4 repetições.
- **Pulsos comprados num canal sem nenhum tráfego,** com zero exato entre os pulsos. Esse caso fica `inconclusivo` para não acusar contadores atualizados em lotes.
- **Padrões abaixo da resolução horária,** isto é, minutos.

Possíveis confusões com casos legítimos:

- **Impulsionamento pago com teto fixo de exibições por hora,** quando a plataforma conta a view no autoplay. As views chegam quase tão regulares quanto as de um robô, e o desenho é o de um pacote. A família "campanha estável" do dataset inclui esse caso de propósito; a linha "Falsos positivos por família" mostra quanto ele pesa.
- **Lives e estreias programadas.**
- **Erros de coleta:** total acumulado enviado como contagem por hora, ou valor repetido por falha.

Séries horárias idênticas não permitem distinguir origens diferentes.

## Organização

```text
src/classifier/   regras (rules.ts), eventos, análise, sinais e motivos; classify() é uma função pura
src/dataset/      PRNG, famílias e geração do dataset
src/evaluation/   métricas, blocos gerados do README e execução da avaliação
src/examples.ts   séries escritas à mão usadas no README e nos testes
src/app.ts        rotas Hono, validação e erros
scripts/          evaluate.ts e calibrate.ts
test/             casos óbvios, limiares, limitações, motivos, API, dataset e README
data/             dataset de avaliação e manifesto (gerados por npm run evaluate)
```

## Uso de IA

### Feito com IA

Usei o Claude Code com o modelo Claude Opus 5.5. Pedi a análise do enunciado, um plano e a implementação. A IA produziu:

- **Plano:** análise do enunciado e um plano de implementação, revisado contra os critérios de avaliação.
- **Código:** o classificador (regras, eventos, sinais e motivos), a API, o gerador do dataset e os comandos `evaluate` e `calibrate`.
- **Testes:** os testes e as séries escritas à mão usadas neles e no README.
- **Calibração:** rodou as variações dos limiares no conjunto de calibração e propôs a escolha. A troca de critério descrita em [Dataset sintético](#dataset-sintético) saiu dessa etapa.
- **Texto:** este README e os modelos de frase dos motivos.

A IA também rodou a checagem de tipos, os testes e o comando de avaliação. Os números deste README saem do comando, não de texto escrito pela IA. Todos os motivos das séries de teste estão em `test/__snapshots__/reasons.test.ts.snap`, para leitura.

### O que eu revisei

- **Motivos:** li todos os motivos gerados para as séries de teste, em `test/__snapshots__/reasons.test.ts.snap`.
- **Regras:** conferi os limiares em `src/classifier/rules.ts` com a tabela de regras deste README.
- **Orgânico × comprado:** revisei o teste e os exemplos de pico orgânico e de pico comprado (`test/organic-vs-bought.test.ts`) e o caso em que o classificador prefere não acusar.
- **Classificador:** li a lógica de eventos, sinais e decisão em `src/classifier`.
- **Dataset:** olhei as famílias do gerador (`src/dataset/families.ts`) e amostras do dataset.
- **API:** revisei as rotas e as mensagens de erro de validação.
- **README:** li este texto de ponta a ponta.
- **Comandos:** rodei `npm test` e `npm run evaluate`.
