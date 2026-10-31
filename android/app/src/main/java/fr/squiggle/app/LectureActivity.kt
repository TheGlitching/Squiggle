package fr.squiggle.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowInsets
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.TextView
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.browser.trusted.TrustedWebActivityIntentBuilder
import androidx.browser.trusted.sharing.ShareData
import androidx.browser.trusted.sharing.ShareTarget
import com.google.androidbrowserhelper.trusted.TwaLauncher

/**
 * What "Partager", then Squiggle, opens: the shared article in the app's own
 * web view, where the reader signs in to their paper once and stays signed in.
 *
 * As soon as the page has loaded, the bookmark "Analyser avec Squiggle"
 * (`web/src/favori/favori.ts`, bundled into `assets/favori.js` by the build)
 * runs in it, as it would in the reader's browser: it reads the page on the
 * phone and heads for /analyser with the page in the address's fragment. That
 * address is never loaded here: it opens in the Trusted Web Activity, where
 * the reader's Squiggle account and the Google sign-in are. Nothing of the
 * article is kept, and our server never fetches it.
 *
 * A YouTube link has no page to read here: the report already made for it, if
 * any, is looked up by the link on /analyser, which says what to do otherwise.
 *
 * A share without a link goes straight to the site in the Trusted Web
 * Activity: a text in the address's fragment, which /analyser analyses at once
 * as a short message or an article (or says why it cannot, for a text too short
 * to claim anything), and
 * screenshots or a PDF through the site's share target (`share_target` in
 * `web/public/manifest.webmanifest`), whose service worker keeps them on the
 * phone for the page to read there (`web/src/captures.ts`, `web/src/pdf.ts`).
 * A text that carries a link but more around it than a headline (a WhatsApp
 * chain, a post) goes there too: it is a message, not an article to open.
 */
class LectureActivity : Activity() {
    private lateinit var page: WebView
    private lateinit var status: TextView
    private lateinit var check: Button
    private val handler = Handler(Looper.getMainLooper())
    private var launcher: TwaLauncher? = null
    /** Whether the next page to finish loading is the shared article, read without a tap. */
    private var readOnLoad = false

    private val prefs by lazy { getSharedPreferences("lecture", MODE_PRIVATE) }

    private val favori by lazy { assets.open("favori.js").bufferedReader().use { it.readText() } }

    /** A page the bookmark could not leave (a consent wall, a script error) gives the button back. */
    private val giveUp = Runnable { idle(getString(R.string.ready)) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.lecture)
        page = findViewById(R.id.page)
        status = findViewById(R.id.status)
        check = findViewById(R.id.check)

        // Android 15 draws every app edge to edge: the bar stays above the system's.
        if (Build.VERSION.SDK_INT >= 35) {
            findViewById<View>(R.id.root).setOnApplyWindowInsetsListener { view, insets ->
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
                insets
            }
        }

        // The site's background, not black, until the paper's page paints.
        page.setBackgroundColor(getColor(R.color.background))
        page.settings.javaScriptEnabled = true
        page.settings.domStorageEnabled = true
        // The paper's sign-in and consent often live on another of its domains.
        CookieManager.getInstance().setAcceptThirdPartyCookies(page, true)
        page.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (isReport(url)) {
                    openReport(url)
                    return true
                }
                // An app's own scheme (intent:, a paper's app) would take the reader out of the page.
                return url.scheme != "https" && url.scheme != "http"
            }

            override fun onPageFinished(view: WebView, url: String) {
                if (!readOnLoad) return
                readOnLoad = false
                // ponytail: a fixed wait for a site that finishes rendering after its load event; lecture.ts scrolls for the rest.
                handler.postDelayed(::read, SETTLE_MS)
            }
        }
        check.setOnClickListener { read() }

        open(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        open(intent)
    }

    private fun open(intent: Intent) {
        handler.removeCallbacksAndMessages(null)
        val type = intent.type.orEmpty()
        if (type.startsWith("image/") || type == PDF) {
            val files = sharedStreams(intent)
            if (files.isEmpty()) return say(R.string.empty_share)
            // The share target is the site's service worker, which the browser only has once
            // the site has been opened: before that, the POST would carry the files to our
            // server and end on an error. The page then offers to import them, and the next
            // share goes through.
            // ponytail: a flag, not a check of the worker itself; a browser whose data was
            // cleared since still gets the server's error, until the site is opened again.
            if (prefs.getBoolean(SITE_OPENED, false)) {
                openReport(Uri.parse("$ORIGIN/analyser"), ShareData(null, null, files))
            } else {
                openReport(Uri.parse("$ORIGIN/analyser?captures=${files.size}"))
            }
            finish()
            return
        }
        val text = intent.getStringExtra(Intent.EXTRA_TEXT).orEmpty().trim()
        val link = sharedLink(text)
        if (link == null || isMessage(text)) {
            if (text.isEmpty()) return say(R.string.empty_share)
            // In the fragment, which never reaches a server, as the iPhone shortcut sends an article.
            openReport(Uri.parse("$ORIGIN/analyser#text=${Uri.encode(text)}&via=appli"))
            finish()
            return
        }
        if (isYoutube(link)) {
            openReport(Uri.parse("$ORIGIN/analyser").buildUpon().appendQueryParameter("url", link.toString()).build())
            finish()
            return
        }
        check.visibility = View.VISIBLE
        check.isEnabled = false
        status.text = getString(R.string.loading)
        readOnLoad = true
        page.loadUrl(link.toString())
    }

    private fun read() {
        check.isEnabled = false
        status.text = getString(R.string.reading)
        page.evaluateJavascript(favori, null)
        handler.postDelayed(giveUp, GIVE_UP_MS)
    }

    /** A share this screen cannot hand on: the reason, without the article's button. */
    private fun say(message: Int) {
        check.visibility = View.GONE
        status.text = getString(message)
    }

    private fun idle(message: String) {
        handler.removeCallbacks(giveUp)
        check.isEnabled = true
        status.text = message
    }

    /** `files`: screenshots or a PDF for the site's share target, which the browser posts to it with read access. */
    private fun openReport(url: Uri, files: ShareData? = null) {
        idle(getString(R.string.ready))
        // In a browser the bookmark's banner leaves with the page; here the page stays, behind the report.
        page.evaluateJavascript(REMOVE_BANNER, null)
        val colors = CustomTabColorSchemeParams.Builder()
            .setToolbarColor(getColor(R.color.background))
            .setNavigationBarColor(getColor(R.color.surface))
            .build()
        val twa = TrustedWebActivityIntentBuilder(url)
            .setColorScheme(CustomTabsIntent.COLOR_SCHEME_DARK)
            .setColorSchemeParams(CustomTabsIntent.COLOR_SCHEME_DARK, colors)
            .setDefaultColorSchemeParams(colors)
        if (files != null) twa.setShareParams(SHARE_TARGET, files)
        launcher?.destroy()
        launcher = TwaLauncher(this).also { it.launch(twa, null, null, null) }
        prefs.edit().putBoolean(SITE_OPENED, true).apply()
    }

    @Deprecated("The web view's history first, then the app before it.")
    override fun onBackPressed() {
        if (page.canGoBack()) page.goBack() else super.onBackPressed()
    }

    override fun onPause() {
        super.onPause()
        // The paper's session survives the app being closed.
        CookieManager.getInstance().flush()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        launcher?.destroy()
        page.destroy()
        super.onDestroy()
    }

    companion object {
        const val ORIGIN = "https://squiggle.fr"
        private const val PDF = "application/pdf"
        /** Whether this app has opened the site in the browser, which installs its service worker. */
        private const val SITE_OPENED = "site_opened"
        private const val SETTLE_MS = 1_500L
        /** lecture.ts scrolls for 15 seconds at most, then the page is gzipped and handed over. */
        private const val GIVE_UP_MS = 25_000L
        /** The banner `favori.ts` puts at the end of the page's body. */
        private const val REMOVE_BANNER =
            "for (const el of document.querySelectorAll('body > div[role=status]')) if (el.textContent.startsWith('Squiggle')) el.remove();"
        /** The site's `share_target`, as `web/public/manifest.webmanifest` declares it. */
        private val SHARE_TARGET = ShareTarget(
            "$ORIGIN/analyser",
            ShareTarget.METHOD_POST,
            ShareTarget.ENCODING_TYPE_MULTIPART,
            ShareTarget.Params("title", "text", listOf(ShareTarget.FileFormField("captures", listOf("image/*", PDF, ".pdf")))),
        )
        private val LINK = Regex("""https?://\S+""")
        private val YOUTUBE = Regex("""(^|\.)(youtube\.com|youtu\.be)$""")

        /** Longest line a paper's app sends before its link, as `paste.ts` reads a share. */
        private const val HEADLINE_MAX_CHARS = 200

        /** The link in a share: papers' apps send "headline link", YouTube a lone link. */
        fun sharedLink(text: String): Uri? = LINK.findAll(text).lastOrNull()?.let { Uri.parse(it.value) }

        /** More around its link than a paper's headline: a message (a chain, a post) that carries a link. */
        fun isMessage(text: String): Boolean = LINK.replace(text, "").trim().length >= HEADLINE_MAX_CHARS

        /** The files of a share: one with SEND, several with SEND_MULTIPLE. */
        @Suppress("DEPRECATION")
        fun sharedStreams(intent: Intent): List<Uri> =
            if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
                intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM).orEmpty()
            } else {
                listOfNotNull(intent.getParcelableExtra(Intent.EXTRA_STREAM))
            }

        fun isYoutube(link: Uri): Boolean = YOUTUBE.containsMatchIn(link.host.orEmpty())

        fun isReport(url: Uri): Boolean = url.scheme == "https" && url.host == "squiggle.fr" && url.path == "/analyser"
    }
}
