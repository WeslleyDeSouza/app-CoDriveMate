package app.codrivemate.serialnative

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.IOException
import java.net.InetSocketAddress
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import kotlin.concurrent.thread

/**
 * TCP connections to OBD adapters in a WiFi. MFi accessories exist on iOS only. NOT compiled or
 * run yet (needs JDK 21).
 */
@CapacitorPlugin(name = "SerialNative")
class SerialNativePlugin : Plugin() {
    private class Channel(val target: String) {
        val socket = Socket()
        val writer = Executors.newSingleThreadExecutor()

        fun close() {
            writer.shutdown()
            // Also ends a pending connect or read.
            try {
                socket.close()
            } catch (_: IOException) {
                // closed anyway
            }
        }
    }

    private val channels = ConcurrentHashMap<String, Channel>()

    @PluginMethod
    fun connectTcp(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("No id")
        val host = call.getString("host")
        val port = call.getInt("port") ?: 0
        if (host.isNullOrEmpty() || port !in 1..65535) return call.reject("Invalid address")
        val timeoutMs = call.getInt("timeoutMs") ?: 10000
        val channel = Channel("$host:$port")
        // Adapters serve one client: a connection left over from an earlier page must go.
        for ((other, old) in channels) {
            if (other != id && old.target == channel.target && channels.remove(other, old)) {
                old.close()
                notifyListeners("closed", JSObject().put("id", other))
            }
        }
        channels.put(id, channel)?.close()
        thread(name = "serial-$id") { run(id, channel, host, port, timeoutMs, call) }
    }

    @PluginMethod
    fun listAccessories(call: PluginCall) {
        call.unavailable("unavailable")
    }

    @PluginMethod
    fun connectAccessory(call: PluginCall) {
        call.unavailable("unavailable")
    }

    @PluginMethod
    fun write(call: PluginCall) {
        val channel = channels[call.getString("id") ?: ""] ?: return call.reject("Not connected")
        val bytes = try {
            Base64.decode(call.getString("data") ?: "", Base64.DEFAULT)
        } catch (_: IllegalArgumentException) {
            return call.reject("Invalid data")
        }
        try {
            channel.writer.execute {
                try {
                    val output = channel.socket.getOutputStream()
                    output.write(bytes)
                    output.flush()
                    call.resolve()
                } catch (error: IOException) {
                    call.reject(error.message ?: "Writing failed", error)
                }
            }
        } catch (_: RejectedExecutionException) {
            call.reject("Not connected")
        }
    }

    @PluginMethod
    fun close(call: PluginCall) {
        channels.remove(call.getString("id") ?: "")?.close()
        call.resolve()
    }

    override fun handleOnDestroy() {
        channels.values.forEach { it.close() }
        channels.clear()
    }

    private fun run(
        id: String,
        channel: Channel,
        host: String,
        port: Int,
        timeoutMs: Int,
        call: PluginCall,
    ) {
        val socket = channel.socket
        try {
            bindToWifi(socket)
            socket.tcpNoDelay = true
            socket.keepAlive = true
            socket.connect(InetSocketAddress(host, port), timeoutMs)
        } catch (error: Exception) {
            channels.remove(id, channel)
            channel.close()
            return call.reject(error.message ?: "Connecting failed", error)
        }
        call.resolve()
        try {
            val input = socket.getInputStream()
            val buffer = ByteArray(4096)
            while (true) {
                val count = input.read(buffer)
                if (count < 0 || channels[id] !== channel) break
                val data = Base64.encodeToString(buffer, 0, count, Base64.NO_WRAP)
                notifyListeners("data", JSObject().put("id", id).put("data", data))
            }
        } catch (_: IOException) {
            // ends below
        }
        channel.close()
        // Not after close(): that one was wanted.
        if (channels.remove(id, channel)) notifyListeners("closed", JSObject().put("id", id))
    }

    /**
     * The adapter's WiFi has no internet, so Android may prefer mobile data. Only possible where
     * the app holds ACCESS_NETWORK_STATE; without it the socket takes the default network.
     */
    @SuppressLint("MissingPermission")
    @Suppress("DEPRECATION")
    private fun bindToWifi(socket: Socket) {
        val granted =
            context.checkSelfPermission(Manifest.permission.ACCESS_NETWORK_STATE)
        if (granted != PackageManager.PERMISSION_GRANTED) return
        val manager =
            context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
        val wifi = manager.allNetworks.firstOrNull {
            manager.getNetworkCapabilities(it)
                ?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
        }
        wifi?.bindSocket(socket)
    }
}
