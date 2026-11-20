# PortaFluter

A browser-based practice workspace for standard Boehm-system concert C flute. Browse fingerings from C4 through C7, study flashcards, play all 12 major and 12 natural minor scales, work on short note sets, and read five solo flute arrangements. Practice history, a review queue, a one-hour timer, and an on-device tuner are built in.

## Run locally

From the repository root, start a static web server. With Python 3:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open [PortaFluter on localhost](http://localhost:8000). The app uses browser modules, so serve the files over HTTP on localhost or HTTPS.

For GitHub Pages, select **Deploy from a branch** under **Settings → Pages** and choose the branch and **/ (root)**. For a self-hosted site, serve `index.html`, `notation.css`, and the `css/` and `js/` directories over HTTPS. The files use relative paths and can live in a site subdirectory. If your host supports security response headers, set `Permissions-Policy: microphone=(self), camera=()` and a Content Security Policy with `frame-ancestors 'none'`. The app already includes a resource policy in its HTML.

## Practice and privacy

- Mark each scale or note set as practiced manually. The review queue includes unplayed items and items last practiced at least 72 hours ago. A **Needs more practice** flag gives eligible items priority.
- Practice history and timer state are saved in browser storage for this site. Clearing site data clears this history.
- The tuner needs a microphone and a secure context. Audio samples are analyzed in memory on the device with no recordings or upload. The tuner stops when the page is backgrounded or you leave the Tuner view.
- The timer recovers elapsed time after a reload or a suspended tab. A completion chime depends on the browser being able to run and play audio. The app shows completion when you return.

## Jazz practice

Open **Music → Jazz** for two beginner exercises. **Swing** teaches jazz rhythm and articulation with a straight and swung model, a count-in, and four bars of clicks on beats 2 and 4. **Hear it, play it** teaches jazz phrasing and ear training. Listen to a short riff, echo it over the next bar, and reveal its staff and fingering hints to check your answer. Both exercises have adjustable tempo and can be marked in the Practice review queue. All playback is generated in the browser.

## Checks

The app has no build or runtime dependencies. Run the regression checks with [Deno](https://deno.com/):

```sh
deno test tests
```

## Music references

- The standard fingering data is based on the [Woodwind Fingering Guide](https://www.wfg.woodwind.org/flute/) and [Yamaha's flute guide](https://www.yamaha.com/en/musical_instrument_guide/flute/play/play002.html).
- The original flute settings draw on historical sources for [Ode to Joy](https://www.loc.gov/item/2021668114/), [Greensleeves](https://urresearch.rochester.edu/institutionalPublicationPublicView.action?institutionalItemVersionId=17175), [Clair de lune](https://urresearch.rochester.edu/institutionalPublicationPublicView.action?institutionalItemId=11883), [Amazing Grace](https://www.loc.gov/collections/amazing-grace/articles-and-essays/timeline/), and [Twinkle, Twinkle, Little Star](https://dme.mozarteum.at/DME/objs/pdf/nma_199_49_57.pdf).
- The tuner uses a normalized square difference function based on [McLeod and Wyvill's pitch detection work](https://quod.lib.umich.edu/cgi/p/pod/dod-idx/smarter-way-to-find-pitch.pdf?c=icmc%3Bidno%3Dbbp2372.2005.107%3Bformat%3Dpdf).
