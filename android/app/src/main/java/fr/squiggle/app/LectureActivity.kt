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
 */
class LectureActivity : Activity() {
    private lateinit var page: WebView
    private lateinit var status: TextView
    private lateinit var check: Button
    private val handler = Handler(Looper.getMainLooper())
    private var launcher: TwaLauncher? = null
    /** Whether the next page to finish loading is the shared article, read without a tap. */
    private var readOnLoad = false

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
        val link = sharedLink(intent.getStringExtra(Intent.EXTRA_TEXT).orEmpty())
        if (link == null) {
            check.visibility = View.GONE
            status.text = getString(R.string.no_link)
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

    private fun idle(message: String) {
        handler.removeCallbacks(giveUp)
        check.isEnabled = true
        status.text = message
    }

    private fun openReport(url: Uri) {
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
        launcher?.destroy()
        launcher = TwaLauncher(this).also { it.launch(twa, null, null, null) }
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
        private const val SETTLE_MS = 1_500L
        /** lecture.ts scrolls for 15 seconds at most, then the page is gzipped and handed over. */
        private const val GIVE_UP_MS = 25_000L
        /** The banner `favori.ts` puts at the end of the page's body. */
        private const val REMOVE_BANNER =
            "for (const el of document.querySelectorAll('body > div[role=status]')) if (el.textContent.startsWith('Squiggle')) el.remove();"
        private val LINK =Regex("""https?://\S+""")
        private val YOUTUBE = Regex("""(^|\.)(youtube\.com|youtu\.be)$""")

        /** The link in a share: papers' apps send "headline link", YouTube a lone link. */
        fun sharedLink(text: String): Uri? = LINK.findAll(text).lastOrNull()?.let { Uri.parse(it.value) }

        fun isYoutube(link: Uri): Boolean = YOUTUBE.containsMatchIn(link.host.orEmpty())

        fun isReport(url: Uri): Boolean = url.scheme == "https" && url.host == "squiggle.fr" && url.path == "/analyser"
    }
}
