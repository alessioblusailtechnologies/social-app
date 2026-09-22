# be-agent — il backend agentico

Il secondo backend. Espone **le stesse rotte di `be-node`**, sullo stesso database e sullo stesso
storage: quello che cambia è chi genera. Per provarlo si sposta `EXPO_PUBLIC_API_URL` dell'app dalla
3010 alla 3011; per tornare indietro si rimette com'era. Nessuno dei due tocca i dati dell'altro in
modo diverso: scrivono negli stessi brand, nelle stesse idee, negli stessi contenuti.

## Cosa cambia davvero

`be-node` usa l'Agent SDK ma lo svuota: prompt di sistema sostituito, nessuno strumento tranne il
web, una cartella di lavoro vuota, quattro giri per consegnare, sessione che non si ricorda niente.
Quello che resta è, di fatto, una chiamata sola con WebFetch attaccato.

Qui l'SDK sta com'è nato:

| | `be-node` | `be-agent` |
|---|---|---|
| Prompt di sistema | una stringa nostra, **al posto** di quella di Claude Code | quella di Claude Code, col compito **in coda** |
| Strumenti | `WebFetch`, `WebSearch`, e solo in 4 compiti su 11 | tutti quelli nativi: Read, Write, Edit, Bash, Glob, Grep, Task, web |
| Cartella di lavoro | vuota, in `tmp` | il **profilo del brand**, come file veri |
| `CLAUDE.md` | `settingSources: []`, non lo legge | legge quello della cartella di lavoro |
| Giri | 4 senza strumenti, 14 con | 40 |
| Modello | quello di `AI_MODEL` (oggi `deepseek-flash`) | `claude-opus-5-5`, effort `high` |
| Output strutturato | sì | sì — l'app si aspetta quella forma |

L'output strutturato resta perché il contratto con l'app non cambia, ma è una funzione dell'SDK, non
una gabbia aggiunta da noi.

## La cartella di lavoro

È tutto il contesto che l'agente riceve. Invece di gonfiare il prompt, il profilo diventa file, e
l'agente se li legge con i suoi strumenti come farebbe in un repo. Una cartella per brand, in
`.workspaces/<brandId>/`, rifatta da zero quando il brand cambia:

```
BRAND.md         chi è, perché pubblica, canali, temi, come parla, come si vede
CLAUDE.md        come si lavora in questa cartella
linea/           i template di card scritti nell'onboarding: <id>.html e <id>.css
esempi/          le card d'esempio approvate dall'utente (PNG)
esempi/foto/     le foto di quelle card
riferimenti/     le immagini da cui è nata la linea grafica
```

Il punto è `esempi/`: quando l'agente pensa al visivo di un contenuto ha **davanti agli occhi** le
card che l'utente ha già approvato, non una descrizione a parole. Opus 5.5 le guarda davvero.

Nei compiti dell'onboarding il brand non esiste ancora: lì si lavora in una cartella vuota, come in
`be-node`.

## Far partire

Serve `be-node/.env` compilato (Supabase, database, `ANTHROPIC_API_KEY`) — è la stessa
infrastruttura. Qui si aggiungono solo le manopole dell'agente, tutte facoltative:

```
npm install
npm run dev        # ascolta sulla 3011
```

Poi, nell'app, in `.env.local`:

```
EXPO_PUBLIC_API_URL=http://localhost:3011/api
```

I due backend possono stare accesi insieme: 3010 e 3011.

## Quello che c'è da sapere prima di usarlo

**L'agente ha gli strumenti veri.** `permissionMode: 'bypassPermissions'`: scrive file ed esegue
comandi senza chiedere. La cartella di lavoro è la sua, ma `Bash` non è chiuso lì dentro. Va bene su
una macchina di sviluppo; non è una postura da produzione. L'unico paletto che resta è quello di
`be-node`: `WebFetch` può aprire solo indirizzi pubblici.

**Costa un altro ordine di grandezza.** `deepseek-flash` è $0,3 / $1,2 per milione di token; Opus 5.5
è ben più caro, e soprattutto qui una generazione non è una chiamata: sono decine di giri, con
letture di file e immagini. Il tetto è `AGENT_MAX_BUDGET_USD` (3 $ per generazione): l'SDK ferma la
sessione quando lo supera. Conviene guardare i consumi — finiscono nella stessa tabella di `be-node`.

**Ci mette minuti, non secondi.** `AGENT_TIMEOUT_MS` è a 15 minuti. Le rotte `/stream` mandano i
passi man mano, quindi l'app mostra cosa sta facendo invece dello skeleton; ma se un client ha un
timeout suo più corto, va alzato.

**Il direttore artistico di «Come appare» non è cambiato.** Guarda le immagini e scrive i template
del brand con una chiamata sola in streaming: non passa dal motore, quindi resta quello di `be-node`
(già su un Claude, con `DESIGN_MODEL`).

## Due modifiche a `be-node`

Additive, per far vedere all'app i passi degli strumenti nativi:

- `src/ai/engine.ts` — `ToolEvent.tool` da `WebTool` a `string`. Il motore di `be-node` continua a
  emettere solo pagine e ricerche: niente cambia per lui.
- `src/ai/steps.ts` — le parole dei passi anche per Read, Write, Edit, Bash, Glob, Grep, Task.
