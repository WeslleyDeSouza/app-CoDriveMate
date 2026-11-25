package app.codrivemate.mapboxnative

import android.graphics.BitmapFactory
import android.graphics.Color
import android.util.Base64
import android.view.ViewGroup
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.mapbox.bindgen.Value
import com.mapbox.common.Cancelable
import com.mapbox.common.MapboxOptions
import com.mapbox.common.TileRegionLoadOptions
import com.mapbox.common.TileStore
import com.mapbox.geojson.LineString
import com.mapbox.geojson.Point
import com.mapbox.maps.CameraOptions
import com.mapbox.maps.GlyphsRasterizationMode
import com.mapbox.maps.MapInitOptions
import com.mapbox.maps.MapLoadingErrorType
import com.mapbox.maps.MapView
import com.mapbox.maps.OfflineManager
import com.mapbox.maps.StylePackLoadOptions
import com.mapbox.maps.TilesetDescriptorOptions
import com.mapbox.maps.mapsOptions
import com.mapbox.maps.plugin.animation.MapAnimationOptions
import com.mapbox.maps.plugin.animation.camera
import com.mapbox.maps.plugin.animation.easeTo
import com.mapbox.maps.plugin.compass.compass
import com.mapbox.maps.plugin.scalebar.scalebar

/**
 * Mapbox maps behind the web view, told apart by `mapId`. Logo and attribution stay visible, as
 * Mapbox requires. NOT compiled or run yet (needs JDK 21).
 */
@CapacitorPlugin(name = "MapboxNative")
class MapboxNativePlugin : Plugin() {
    private class OpenMap(val view: MapView, var pendingCreate: PluginCall?) {
        val subscriptions = mutableListOf<Cancelable>()
    }

    private val maps = mutableMapOf<String, OpenMap>()

    @PluginMethod
    fun create(call: PluginCall) {
        val token = call.getString("token") ?: return call.reject("No token")
        val style = call.getString("style") ?: return call.reject("No style")
        val frame = call.getObject("frame") ?: return call.reject("No frame")
        val camera = cameraOf(call) ?: return call.reject("Invalid camera")
        val mapId = mapId(call)
        activity.runOnUiThread {
            removeMap(mapId)
            MapboxOptions.accessToken = token
            val web = bridge.webView
            val parent = web.parent as ViewGroup
            // A texture view is drawn in the view hierarchy, so the web view can lie above it.
            val map = MapView(
                context,
                MapInitOptions(
                    context = context,
                    cameraOptions = camera,
                    textureView = true,
                    styleUri = style,
                ),
            )
            map.scalebar.enabled = false
            map.compass.enabled = false
            map.setOnTouchListener { _, _ -> true }
            web.setBackgroundColor(Color.TRANSPARENT)
            parent.addView(map, 0, ViewGroup.LayoutParams(1, 1))
            val open = OpenMap(map, call)
            maps[mapId] = open
            place(map, frame)

            open.subscriptions += map.mapboxMap.subscribeStyleLoaded {
                open.pendingCreate?.resolve()
                open.pendingCreate = null
            }
            open.subscriptions += map.mapboxMap.subscribeMapLoadingError { error ->
                failed(mapId, error.message, error.type == MapLoadingErrorType.STYLE)
            }
        }
    }

    @PluginMethod
    fun destroy(call: PluginCall) {
        activity.runOnUiThread {
            removeMap(mapId(call))
            call.resolve()
        }
    }

    @PluginMethod
    fun setFrame(call: PluginCall) {
        val frame = call.getObject("frame") ?: return call.reject("No frame")
        withMap(call) { place(it, frame) }
    }

    @PluginMethod
    fun setCamera(call: PluginCall) {
        val camera = cameraOf(call) ?: return call.reject("Invalid camera")
        val duration = call.getDouble("durationMs")?.toLong() ?: 0L
        withMap(call) {
            it.camera.cancelAllAnimators()
            if (duration > 0) {
                it.mapboxMap.easeTo(camera, MapAnimationOptions.mapAnimationOptions { duration(duration) })
            } else {
                it.mapboxMap.setCamera(camera)
            }
        }
    }

    @PluginMethod
    fun addSource(call: PluginCall) {
        withMap(call) { it.mapboxMap.addStyleSource(call.text("id"), json(call.text("source"))).orThrow() }
    }

    @PluginMethod
    fun setData(call: PluginCall) {
        withMap(call) {
            it.mapboxMap.setStyleSourceProperty(call.text("id"), "data", json(call.text("data"))).orThrow()
        }
    }

    @PluginMethod
    fun addLayer(call: PluginCall) {
        withMap(call) { it.mapboxMap.addStyleLayer(json(call.text("layer")), null).orThrow() }
    }

    @PluginMethod
    fun setVisible(call: PluginCall) {
        val value = if (call.getBoolean("visible") != false) "visible" else "none"
        withMap(call) {
            it.mapboxMap.setStyleLayerProperty(call.text("id"), "visibility", Value.valueOf(value)).orThrow()
        }
    }

    @PluginMethod
    fun addImage(call: PluginCall) {
        withMap(call) {
            val bytes = Base64.decode(call.text("png"), Base64.DEFAULT)
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: error("Invalid image")
            bitmap.density = (160 * (call.getDouble("scale") ?: 1.0)).toInt()
            // The map draws bitmaps in device pixels: scale from CSS pixels to the display.
            val factor = density() / (call.getDouble("scale")?.toFloat() ?: 1f)
            val size = { value: Int -> maxOf(1, (value * factor).toInt()) }
            val scaled = android.graphics.Bitmap.createScaledBitmap(
                bitmap, size(bitmap.width), size(bitmap.height), true,
            )
            it.mapboxMap.addImage(call.text("id"), scaled).orThrow()
        }
    }

    @PluginMethod
    fun setConfig(call: PluginCall) {
        val value = when (val raw = call.data.opt("value")) {
            is Boolean -> Value.valueOf(raw)
            else -> Value.valueOf(raw?.toString() ?: "")
        }
        withMap(call) {
            it.mapboxMap.setStyleImportConfigProperty("basemap", call.text("name"), value).orThrow()
        }
    }

    /**
     * Style packs plus the tile packs along the line, in the tile store that
     * the map reads from.
     */
    @PluginMethod
    fun saveOffline(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("No id")
        val token = call.getString("token") ?: return call.reject("No token")
        val styles = call.getArray("styles")?.let { list -> List(list.length()) { list.getString(it) } }
        val points = call.getArray("points")?.let { list ->
            List(list.length()) { list.getJSONArray(it).let { p -> Point.fromLngLat(p.getDouble(0), p.getDouble(1)) } }
        }
        if (styles.isNullOrEmpty() || points == null || points.size < 2) return call.reject("Invalid offline options")
        activity.runOnUiThread {
            MapboxOptions.accessToken = token
            val manager = OfflineManager()
            val descriptors = styles.map { style ->
                manager.createTilesetDescriptor(
                    TilesetDescriptorOptions.Builder()
                        .styleURI(style).pixelRatio(density()).minZoom(0).maxZoom(16).build(),
                )
            }
            val region = TileRegionLoadOptions.Builder()
                .geometry(LineString.fromLngLats(points))
                .descriptors(descriptors)
                .acceptExpired(false)
                .build()
            val store = MapboxOptions.mapsOptions.tileStore ?: TileStore.create()
            loadStyles(manager, styles) { error ->
                if (error != null) {
                    call.reject(error)
                } else {
                    store.loadTileRegion(id, region, { progress ->
                        val share = progress.completedResourceCount.toDouble() / maxOf(1L, progress.requiredResourceCount)
                        notifyListeners("offlineProgress", JSObject().put("share", share))
                    }) { result ->
                        val failure = result.error
                        if (failure == null) call.resolve() else call.reject(failure.message)
                    }
                }
            }
        }
    }

    private fun loadStyles(manager: OfflineManager, styles: List<String>, done: (String?) -> Unit) {
        val style = styles.firstOrNull() ?: return done(null)
        val options = StylePackLoadOptions.Builder()
            .glyphsRasterizationMode(GlyphsRasterizationMode.IDEOGRAPHS_RASTERIZED_LOCALLY)
            .acceptExpired(false)
            .build()
        manager.loadStylePack(style, options, { }) { result ->
            val failure = result.error
            if (failure != null) done(failure.message) else loadStyles(manager, styles.drop(1), done)
        }
    }

    override fun handleOnDestroy() {
        maps.keys.toList().forEach { removeMap(it) }
    }

    private fun withMap(call: PluginCall, action: (MapView) -> Unit) {
        activity.runOnUiThread {
            val map = maps[mapId(call)]?.view
            if (map == null) {
                call.reject("No map")
            } else {
                try {
                    action(map)
                    call.resolve()
                } catch (error: Exception) {
                    call.reject(error.message ?: "Map call failed")
                }
            }
        }
    }

    private fun mapId(call: PluginCall) = call.getString("mapId") ?: "main"

    private fun failed(mapId: String, message: String, isStyle: Boolean) {
        val rejected = Regex("\\b40[13]\\b|unauthori|forbidden|access token", RegexOption.IGNORE_CASE)
            .containsMatchIn(message)
        val data = JSObject().put("mapId", mapId).put("message", message).put("rejected", rejected)
        // A single missing tile is no reason to give up while the style is loading.
        if (isStyle || rejected) {
            val open = maps[mapId]
            open?.pendingCreate?.reject(message, null, null, JSObject().put("rejected", rejected))
            open?.pendingCreate = null
        }
        notifyListeners("mapError", data)
    }

    private fun removeMap(mapId: String) {
        val open = maps.remove(mapId) ?: return
        open.pendingCreate?.reject("Map removed")
        open.pendingCreate = null
        open.subscriptions.forEach { it.cancel() }
        (open.view.parent as? ViewGroup)?.removeView(open.view)
    }

    private fun density() = context.resources.displayMetrics.density

    private fun place(map: MapView, frame: JSObject) {
        val d = density()
        val web = bridge.webView
        map.x = web.x + (frame.optDouble("x") * d).toFloat()
        map.y = web.y + (frame.optDouble("y") * d).toFloat()
        map.layoutParams = map.layoutParams.apply {
            width = (frame.optDouble("width") * d).toInt()
            height = (frame.optDouble("height") * d).toInt()
        }
    }

    private fun cameraOf(call: PluginCall): CameraOptions? {
        val camera = call.getObject("camera") ?: return null
        val center = camera.optJSONArray("center") ?: return null
        return CameraOptions.Builder()
            .center(Point.fromLngLat(center.optDouble(0), center.optDouble(1)))
            .zoom(camera.optDouble("zoom"))
            .bearing(camera.optDouble("bearing"))
            .pitch(camera.optDouble("pitch"))
            .build()
    }

    private fun PluginCall.text(name: String) = getString(name) ?: error("Missing $name")

    private fun json(text: String): Value {
        val parsed = Value.fromJson(text)
        return parsed.value ?: error(parsed.error ?: "Invalid JSON")
    }

    private fun com.mapbox.bindgen.Expected<String, *>.orThrow() {
        error?.let { throw IllegalStateException(it) }
    }
}
