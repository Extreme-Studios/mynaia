package com.extremestudios.mynaia;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.util.Base64;
import android.view.WindowManager;
import android.webkit.CookieManager;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.io.File;
import java.io.FileOutputStream;

@CapacitorPlugin(name = "MyNaia", permissions = {
    @Permission(alias = "microphone", strings = {Manifest.permission.RECORD_AUDIO})
})
public class MyNaiaPlugin extends Plugin {
    private boolean active = false, immersive = false, foreground = true;

    @PluginMethod public void microphone(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) permissionResult(call);
        else if (getPermissionState("microphone") == PermissionState.DENIED) permissionResult(call);
        else requestPermissionForAlias("microphone", call, "permissionResult");
    }
    @PermissionCallback private void permissionResult(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("microphone") == PermissionState.GRANTED);
        result.put("permanent", getPermissionState("microphone") == PermissionState.DENIED);
        call.resolve(result);
    }
    void updateWindow() {
        getActivity().runOnUiThread(() -> {
            if (active && foreground) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getActivity().getWindow(), getBridge().getWebView());
            bars.setAppearanceLightStatusBars(false); bars.setAppearanceLightNavigationBars(false);
            bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            if (immersive && foreground) bars.hide(WindowInsetsCompat.Type.systemBars());
            else bars.show(WindowInsetsCompat.Type.systemBars());
        });
    }
    @PluginMethod public void callState(PluginCall call) {
        active = call.getBoolean("active", false); immersive = active; updateWindow(); call.resolve();
    }
    @PluginMethod public void fullscreen(PluginCall call) {
        immersive = call.getBoolean("active", false); updateWindow(); call.resolve();
    }
    @Override protected void handleOnPause() { foreground = false; updateWindow(); }
    @Override protected void handleOnResume() { foreground = true; updateWindow(); }
    @Override protected void handleOnDestroy() { active = false; immersive = false; updateWindow(); }
    void back() { notifyListeners("back", new JSObject()); }
    void resetPage() { removeAllListeners(); active = false; immersive = false; updateWindow(); }
    @PluginMethod public void exit(PluginCall call) { getActivity().finish(); call.resolve(); }
    @PluginMethod public void openSettings(PluginCall call) {
        getActivity().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getActivity().getPackageName())));
        call.resolve();
    }
    @PluginMethod public void logout(PluginCall call) {
        CookieManager manager = CookieManager.getInstance();
        manager.setCookie("https://mynaia.extremestudiosai.com", "naya_access=; Max-Age=0; Path=/; Secure; HttpOnly", (done) -> { manager.flush(); call.resolve(); });
    }
    @PluginMethod public void openExternal(PluginCall call) {
        Uri uri = Uri.parse(call.getString("url", ""));
        if (!"https".equals(uri.getScheme())) { call.reject("HTTPS required"); return; }
        try { getActivity().startActivity(new Intent(Intent.ACTION_VIEW, uri)); call.resolve(); }
        catch (Exception error) { call.reject("Tidak ada aplikasi untuk membuka tautan."); }
    }
    @PluginMethod public void sharePdf(PluginCall call) {
        try {
            byte[] bytes = Base64.decode(call.getString("data", ""), Base64.DEFAULT);
            if (bytes.length < 5 || bytes.length > 20 * 1024 * 1024 || !new String(bytes, 0, 5, java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-")) {
                call.reject("Invalid PDF"); return;
            }
            File directory = new File(getContext().getCacheDir(), "reports"); directory.mkdirs();
            File[] old = directory.listFiles(); if (old != null) for (File item : old) item.delete();
            File file = new File(directory, "MyNaiA-laporan.pdf");
            try (FileOutputStream stream = new FileOutputStream(file)) { stream.write(bytes); }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_SEND).setType("application/pdf").putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(intent, "Buka atau bagikan laporan")); call.resolve();
        } catch (Exception error) { call.reject("Laporan tidak dapat dibagikan."); }
    }
}
