package com.extremestudios.mynaia;

import android.Manifest;
import android.os.Bundle;
import android.content.pm.PackageManager;
import android.webkit.PermissionRequest;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;
import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    private PermissionRequest pending;
    private ActivityResultLauncher<String[]> permissions;

    @Override public void onCreate(Bundle state) {
        registerPlugin(MyNaiaPlugin.class);
        super.onCreate(state);
        getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                ((MyNaiaPlugin)getBridge().getPlugin("MyNaia").getInstance()).resetPage();
                super.onPageStarted(view, url, favicon);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                android.net.Uri uri = request.getUrl();
                if (request.isForMainFrame() && "localhost".equals(uri.getHost())) {
                    String path = uri.getPath();
                    if ("/dr-paws/dashboard".equals(path)) { view.loadUrl("https://localhost/dashboard.html"); return true; }
                    if (path != null && path.startsWith("/dr-paws/dashboard/subjects/")) {
                        view.loadUrl("https://localhost/case.html?subject=" + android.net.Uri.encode(uri.getLastPathSegment())); return true;
                    }
                }
                return super.shouldOverrideUrlLoading(view, request);
            }
        });
        permissions = registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), result -> grantApproved());
        getBridge().getWebView().setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> requestMedia(request));
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pending == request) pending = null;
            }
            @Override public boolean onConsoleMessage(android.webkit.ConsoleMessage message) {
                return true; // Never persist child/session content in Android logs.
            }
            @Override public boolean onJsConfirm(WebView view, String url, String message, android.webkit.JsResult result) {
                if (!"Akhiri percakapan?".equals(message)) return super.onJsConfirm(view, url, message, result);
                new android.app.AlertDialog.Builder(MainActivity.this).setMessage(message)
                    .setNegativeButton("Batal", (dialog, which) -> result.cancel())
                    .setPositiveButton("Akhiri", (dialog, which) -> result.confirm())
                    .setOnCancelListener(dialog -> result.cancel()).show();
                return true;
            }
        });
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                ((MyNaiaPlugin)getBridge().getPlugin("MyNaia").getInstance()).back();
            }
        });
        getBridge().getWebView().setBackgroundColor(android.graphics.Color.rgb(5, 10, 20));
    }
    private void requestMedia(PermissionRequest request) {
        String host = request.getOrigin().getHost();
        boolean trusted = "https".equals(request.getOrigin().getScheme()) && host != null &&
            (host.equals("localhost") || host.equals("daily.co") || host.endsWith(".daily.co") || host.equals("tavus.io") || host.endsWith(".tavus.io"));
        if (!trusted || pending != null) { request.deny(); return; }
        pending = request;
        ArrayList<String> needed = new ArrayList<>();
        for (String resource : request.getResources()) {
            String permission = resource.equals(PermissionRequest.RESOURCE_AUDIO_CAPTURE) ? Manifest.permission.RECORD_AUDIO :
                resource.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE) ? Manifest.permission.CAMERA : null;
            if (permission != null && ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) needed.add(permission);
        }
        if (needed.isEmpty()) grantApproved(); else permissions.launch(needed.toArray(new String[0]));
    }
    private void grantApproved() {
        if (pending == null) return;
        ArrayList<String> approved = new ArrayList<>();
        for (String resource : pending.getResources()) {
            String permission = resource.equals(PermissionRequest.RESOURCE_AUDIO_CAPTURE) ? Manifest.permission.RECORD_AUDIO :
                resource.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE) ? Manifest.permission.CAMERA : null;
            if (permission != null && ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED) approved.add(resource);
        }
        if (approved.isEmpty()) pending.deny(); else pending.grant(approved.toArray(new String[0]));
        pending = null;
    }
}
