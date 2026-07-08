package com.lightycoder.doodad;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.GridLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class MainActivity extends Activity {
    private static final int W = 12;
    private static final int H = 12;
    private static final int CELL_COUNT = W * H;
    private static final int BG = Color.rgb(245, 247, 250);
    private static final int PANEL = Color.WHITE;
    private static final int TEXT = Color.rgb(24, 30, 38);
    private static final int MUTED = Color.rgb(91, 101, 113);
    private static final int BLUE = Color.rgb(47, 125, 225);
    private static final int PURPLE = Color.rgb(119, 92, 232);
    private static final int RED = Color.rgb(210, 74, 74);
    private static final String PREFS = "lightycoder";
    private static final String PREF_DEVICE_ADDRESS = "deviceAddress";
    private static final String PREF_CUSTOM_ANIMATION = "customAnimation";

    private final Handler main = new Handler(Looper.getMainLooper());
    private BluetoothAdapter adapter;
    private BluetoothLeScanner scanner;
    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic commandChar;
    private TextView status;
    private Button scanDisconnectButton;
    private LinearLayout content;
    private GridLayout padGrid;
    private ImageCropView imageCropView;
    private EditText customAnimationEditor;
    private Spinner pcAnimationSpinner;
    private WebView animationScriptView;
    private Bitmap sourceBitmap;
    private boolean imagePixelPreview = false;
    private final int[] pixels = new int[CELL_COUNT];
    private final boolean[] selected = new boolean[CELL_COUNT];
    private final Button[] cells = new Button[CELL_COUNT];
    private int selectedColor = Color.RED;
    private int brightness = 180;
    private boolean multiSelect = true;
    private boolean paintStarted = false;
    private boolean connected = false;
    private String selectedDeviceAddress = "";
    private int animationMode = 0;
    private int animationStep = 0;
    private int customAnimationFrame = 0;
    private String activeAnimationSource = "";
    private boolean animationRunning = false;
    private boolean customAnimationRunning = false;
    private int animationDelayMs = 260;
    private boolean scanInProgress = false;
    private final Map<String, BluetoothDevice> scannedDevices = new LinkedHashMap<>();
    private final Map<String, String> scannedDeviceLabels = new LinkedHashMap<>();

    private final Runnable animationTick = new Runnable() {
        @Override public void run() {
            if (!animationRunning) return;
            renderAnimationFrame(animationMode, animationStep++);
            sendPixels(false);
            main.postDelayed(this, animationDelayMs);
        }
    };

    private final Runnable customAnimationTick = new Runnable() {
        @Override public void run() {
            if (!customAnimationRunning) return;
            renderCustomAnimationFrame(() -> {
                if (customAnimationRunning) main.postDelayed(this, animationDelayMs);
            });
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Arrays.fill(pixels, Color.BLACK);
        BluetoothManager manager = getSystemService(BluetoothManager.class);
        adapter = manager == null ? null : manager.getAdapter();
        scanner = adapter == null ? null : adapter.getBluetoothLeScanner();
        selectedDeviceAddress = getSharedPreferences(PREFS, MODE_PRIVATE).getString(PREF_DEVICE_ADDRESS, "");
        requestBlePermissions();
        animationScriptView = new WebView(this);
        animationScriptView.getSettings().setJavaScriptEnabled(true);
        animationScriptView.loadData("<html><body></body></html>", "text/html", "UTF-8");
        buildShell();
        showPadPage();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void buildShell() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(14), dp(14), dp(14), dp(14));
        root.setBackgroundColor(BG);

        TextView title = new TextView(this);
        title.setText("LightyCoderDoodad");
        title.setTextColor(TEXT);
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER_VERTICAL);
        title.setTypeface(null, 1);
        root.addView(title);

        status = new TextView(this);
        status.setText("Disconnected");
        status.setTextColor(MUTED);
        status.setTextSize(14);
        root.addView(status);

        LinearLayout top = row();
        addButton(top, "Connect", v -> connectSavedDevice(), 1, BLUE);
        addButton(top, "Start Paint", v -> startPaint(), 1, Color.rgb(42, 157, 93));
        scanDisconnectButton = addButton(top, "Scan", v -> scanOrDisconnect(), 1, PURPLE);
        root.addView(top);
        updateScanDisconnectButton();

        LinearLayout nav = row();
        addButton(nav, "Pad", v -> showPadPage(), 1, Color.rgb(230, 235, 241));
        addButton(nav, "Images", v -> showImagesPage(), 1, Color.rgb(230, 235, 241));
        addButton(nav, "Animations", v -> showAnimationsPage(), 1, Color.rgb(230, 235, 241));
        root.addView(nav);

        ScrollView scroll = new ScrollView(this);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
    }

    private LinearLayout row() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(8), 0, dp(8));
        return row;
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(14), dp(14), dp(14));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(PANEL);
        bg.setCornerRadius(dp(14));
        bg.setStroke(dp(1), Color.rgb(218, 225, 232));
        card.setBackground(bg);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, dp(12), 0, dp(12));
        card.setLayoutParams(params);
        return card;
    }

    private Button addButton(LinearLayout parent, String label, View.OnClickListener listener, int weight, int color) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(13);
        button.setOnClickListener(listener);
        styleButton(button, color);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(46), weight);
        params.setMargins(dp(3), 0, dp(3), 0);
        parent.addView(button, params);
        return button;
    }

    private void styleButton(Button button, int color) {
        button.setTextColor(readableText(color));
        button.setBackground(rounded(color, dp(1), darker(color), dp(9)));
    }

    private GradientDrawable rounded(int fill, int strokeWidth, int stroke, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(radius);
        drawable.setStroke(strokeWidth, stroke);
        return drawable;
    }

    private int darker(int color) {
        return Color.rgb(Color.red(color) * 82 / 100, Color.green(color) * 82 / 100, Color.blue(color) * 82 / 100);
    }

    private int readableText(int color) {
        return Color.red(color) + Color.green(color) + Color.blue(color) < 430 ? Color.WHITE : TEXT;
    }

    private void showPadPage() {
        animationRunning = false;
        customAnimationRunning = false;
        content.removeAllViews();
        LinearLayout controls = card();
        controls.addView(label("Paint Pad"));
        controls.addView(text("Tap a square to paint it with the current colour. Selected cells have a blue outline."));
        addColorControls(controls);
        CheckBox multi = new CheckBox(this);
        multi.setText("Keep multiple cells selected");
        multi.setTextColor(TEXT);
        multi.setChecked(multiSelect);
        multi.setOnCheckedChangeListener((buttonView, isChecked) -> multiSelect = isChecked);
        controls.addView(multi);
        content.addView(controls);

        LinearLayout gridCard = card();
        padGrid = new GridLayout(this);
        padGrid.setColumnCount(W);
        padGrid.setUseDefaultMargins(false);
        for (int i = 0; i < CELL_COUNT; i++) {
            final int index = i;
            Button cell = new Button(this);
            cell.setText("");
            cell.setPadding(0, 0, 0, 0);
            cell.setMinWidth(0);
            cell.setMinimumWidth(0);
            cell.setMinHeight(0);
            cell.setMinimumHeight(0);
            cell.setOnClickListener(v -> paintCell(index));
            cell.setOnLongClickListener(v -> { pixels[index] = Color.BLACK; selected[index] = false; renderGrid(); return true; });
            cells[i] = cell;
            padGrid.addView(cell);
        }
        gridCard.addView(padGrid, new LinearLayout.LayoutParams(-1, -2));
        content.addView(gridCard);

        LinearLayout actions = card();
        LinearLayout row = row();
        addButton(row, "Send", v -> sendPixels(true), 1, BLUE);
        addButton(row, "Clear Selected", v -> clearSelection(), 1, Color.rgb(230, 235, 241));
        addButton(row, "Clear All", v -> clearAllPixels(), 1, Color.rgb(230, 235, 241));
        actions.addView(row);
        content.addView(actions);
        resizePadCells();
        renderGrid();
    }

    private void showImagesPage() {
        animationRunning = false;
        customAnimationRunning = false;
        content.removeAllViews();
        LinearLayout panel = card();
        panel.addView(label("Images"));
        panel.addView(text("Load from gallery or files, then drag and pinch the preview. The visible square is sampled to 12x12 when you send."));

        LinearLayout sourceRow = row();
        addButton(sourceRow, "Gallery", v -> pickImageFromGallery(), 1, BLUE);
        addButton(sourceRow, "Files", v -> pickImageFromFiles(), 1, Color.rgb(230, 235, 241));
        addButton(sourceRow, "Send Image", v -> sendImageCrop(), 1, Color.rgb(42, 157, 93));
        panel.addView(sourceRow);

        LinearLayout cropRow = row();
        addButton(cropRow, "Centre Crop", v -> { if (imageCropView != null) imageCropView.resetCrop(); }, 1, Color.rgb(230, 235, 241));
        addButton(cropRow, "Fit", v -> { if (imageCropView != null) imageCropView.resetFit(); }, 1, Color.rgb(230, 235, 241));
        addButton(cropRow, "Zoom +", v -> { if (imageCropView != null) imageCropView.zoomBy(1.12f); }, 1, Color.rgb(230, 235, 241));
        addButton(cropRow, "Zoom -", v -> { if (imageCropView != null) imageCropView.zoomBy(0.90f); }, 1, Color.rgb(230, 235, 241));
        panel.addView(cropRow);

        CheckBox pixelPreview = new CheckBox(this);
        pixelPreview.setText("Pixel preview: show the exact 12x12 output");
        pixelPreview.setTextColor(TEXT);
        pixelPreview.setChecked(imagePixelPreview);
        pixelPreview.setOnCheckedChangeListener((buttonView, isChecked) -> {
            imagePixelPreview = isChecked;
            if (imageCropView != null) imageCropView.invalidate();
        });
        panel.addView(pixelPreview);

        imageCropView = new ImageCropView(this);
        imageCropView.setBitmap(sourceBitmap == null ? bitmapFromPixels12() : sourceBitmap);
        LinearLayout.LayoutParams previewParams = new LinearLayout.LayoutParams(-1, -2);
        previewParams.setMargins(0, dp(8), 0, 0);
        panel.addView(imageCropView, previewParams);
        content.addView(panel);
    }

    private void showAnimationsPage() {
        content.removeAllViews();
        LinearLayout panel = card();
        panel.addView(label("Animations"));
        panel.addView(text("Generated on the phone and streamed as compact canvas frames."));
        addColorControls(panel);
        LinearLayout row1 = row();
        addButton(row1, "Wipe", v -> startAnimation(0), 1, BLUE);
        addButton(row1, "Pulse", v -> startAnimation(1), 1, BLUE);
        addButton(row1, "Rainbow", v -> startAnimation(2), 1, BLUE);
        panel.addView(row1);
        LinearLayout row2 = row();
        addButton(row2, "Heart", v -> startAnimation(3), 1, Color.rgb(226, 66, 112));
        addButton(row2, "Sparkle", v -> startAnimation(4), 1, BLUE);
        addButton(row2, "Scanner", v -> startAnimation(5), 1, BLUE);
        panel.addView(row2);
        LinearLayout row3 = row();
        addButton(row3, "Tetris", v -> startAnimation(6), 1, Color.rgb(236, 143, 40));
        addButton(row3, "Snake", v -> startAnimation(7), 1, Color.rgb(42, 157, 93));
        addButton(row3, "Comet", v -> startAnimation(8), 1, Color.rgb(119, 92, 232));
        panel.addView(row3);
        LinearLayout speedRow = row();
        addButton(speedRow, "Slower", v -> changeAnimationSpeed(60), 1, Color.rgb(230, 235, 241));
        addButton(speedRow, "Stop", v -> stopAnimation(), 1, Color.rgb(210, 74, 74));
        addButton(speedRow, "Faster", v -> changeAnimationSpeed(-60), 1, Color.rgb(230, 235, 241));
        panel.addView(speedRow);
        content.addView(panel);

        Map<String, String> pcScripts = pcAnimationScripts();
        LinearLayout pcPanel = card();
        pcPanel.addView(label("PC Animations"));
        pcPanel.addView(text("The same preset scripts as the PC/web animation page."));
        pcAnimationSpinner = new Spinner(this);
        ArrayAdapter<String> pcAdapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, new ArrayList<>(pcScripts.keySet()));
        pcAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        pcAnimationSpinner.setAdapter(pcAdapter);
        pcPanel.addView(pcAnimationSpinner, new LinearLayout.LayoutParams(-1, dp(48)));
        LinearLayout pcRow = row();
        addButton(pcRow, "Run PC", v -> startPcAnimation(pcScripts), 1, PURPLE);
        addButton(pcRow, "Step", v -> stepPcAnimation(pcScripts), 1, Color.rgb(230, 235, 241));
        addButton(pcRow, "Copy", v -> copyPcAnimationToCustom(pcScripts), 1, Color.rgb(230, 235, 241));
        pcPanel.addView(pcRow);
        content.addView(pcPanel);

        LinearLayout customPanel = card();
        customPanel.addView(label("Custom Animation"));
        customPanel.addView(text("Paste an animation body. Helpers: W, H, i, frame, state, clear, set, rect, line, hsv, fade, rand."));
        customAnimationEditor = new EditText(this);
        customAnimationEditor.setSingleLine(false);
        customAnimationEditor.setMinLines(8);
        customAnimationEditor.setGravity(Gravity.TOP | Gravity.START);
        customAnimationEditor.setTextSize(12);
        customAnimationEditor.setTypeface(Typeface.MONOSPACE);
        customAnimationEditor.setText(getSharedPreferences(PREFS, MODE_PRIVATE).getString(PREF_CUSTOM_ANIMATION, defaultCustomAnimation()));
        customAnimationEditor.setBackground(rounded(Color.rgb(250, 252, 255), dp(1), Color.rgb(203, 213, 225), dp(8)));
        customAnimationEditor.setPadding(dp(10), dp(10), dp(10), dp(10));
        customPanel.addView(customAnimationEditor, new LinearLayout.LayoutParams(-1, dp(190)));
        LinearLayout customRow = row();
        addButton(customRow, "Run Custom", v -> startCustomAnimation(), 1, PURPLE);
        addButton(customRow, "Step", v -> stepCustomAnimation(), 1, Color.rgb(230, 235, 241));
        addButton(customRow, "Stop", v -> stopAnimation(), 1, RED);
        customPanel.addView(customRow);
        content.addView(customPanel);
    }

    private void addColorControls(LinearLayout parent) {
        TextView brush = text("Brush colour");
        brush.setTextColor(MUTED);
        parent.addView(brush);
        LinearLayout colours = row();
        addColourButton(colours, "Black", Color.BLACK);
        addColourButton(colours, "Red", Color.RED);
        addColourButton(colours, "Green", Color.GREEN);
        addColourButton(colours, "Blue", Color.BLUE);
        addColourButton(colours, "White", Color.WHITE);
        addColourButton(colours, "Yellow", Color.YELLOW);
        parent.addView(colours);
        TextView brightLabel = text("Brightness: " + brightness);
        parent.addView(brightLabel);
        SeekBar slider = new SeekBar(this);
        slider.setMax(255);
        slider.setProgress(brightness);
        slider.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                brightness = Math.max(1, progress);
                brightLabel.setText("Brightness: " + brightness);
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });
        parent.addView(slider);
    }

    private void addColourButton(LinearLayout parent, String label, int color) {
        addButton(parent, label, v -> selectedColor = color, 1, color);
    }

    private TextView label(String text) {
        TextView view = text(text);
        view.setTextColor(TEXT);
        view.setTextSize(22);
        view.setTypeface(null, 1);
        view.setPadding(0, 0, 0, dp(8));
        return view;
    }

    private TextView text(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextColor(MUTED);
        view.setTextSize(14);
        view.setPadding(0, dp(4), 0, dp(6));
        return view;
    }

    private void resizePadCells() {
        if (padGrid == null) return;
        padGrid.post(() -> {
            int total = padGrid.getWidth();
            if (total <= 0) return;
            int gap = dp(3);
            int size = (total - gap * (W - 1)) / W;
            for (int i = 0; i < CELL_COUNT; i++) {
                GridLayout.LayoutParams params = new GridLayout.LayoutParams(GridLayout.spec(i / W), GridLayout.spec(i % W));
                params.width = size;
                params.height = size;
                params.setMargins(i % W == 0 ? 0 : gap, i < W ? 0 : gap, 0, 0);
                cells[i].setLayoutParams(params);
            }
        });
    }

    private void paintCell(int index) {
        if (!multiSelect) Arrays.fill(selected, false);
        selected[index] = !selected[index];
        pixels[index] = scaledColor(selectedColor);
        renderGrid();
    }

    private int scaledColor(int color) {
        return Color.rgb(Color.red(color) * brightness / 255, Color.green(color) * brightness / 255, Color.blue(color) * brightness / 255);
    }

    private void clearSelection() {
        Arrays.fill(selected, false);
        renderGrid();
    }

    private void clearAllPixels() {
        Arrays.fill(pixels, Color.BLACK);
        Arrays.fill(selected, false);
        renderGrid();
    }

    private void renderGrid() {
        for (int i = 0; i < cells.length; i++) {
            if (cells[i] == null) continue;
            int fill = pixels[i];
            int stroke = selected[i] ? BLUE : Color.rgb(188, 197, 207);
            int strokeWidth = selected[i] ? dp(3) : dp(1);
            cells[i].setBackground(rounded(fill, strokeWidth, stroke, dp(5)));
        }
    }

    private void requestBlePermissions() {
        if (Build.VERSION.SDK_INT >= 31) {
            requestPermissions(new String[]{Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT}, 10);
        } else {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, 10);
        }
    }

    private boolean hasBlePermission() {
        if (Build.VERSION.SDK_INT >= 31) {
            return checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
                    && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
        }
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void connectSavedDevice() {
        if (!hasBlePermission()) { requestBlePermissions(); return; }
        if (adapter == null || !adapter.isEnabled()) {
            startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS));
            return;
        }
        if (selectedDeviceAddress == null || selectedDeviceAddress.isEmpty()) {
            toast("Scan to choose an Arcade Coder first");
            scanForDeviceChoice();
            return;
        }
        try {
            connectToDevice(adapter.getRemoteDevice(selectedDeviceAddress), "Saved device | " + selectedDeviceAddress);
        } catch (IllegalArgumentException exc) {
            selectedDeviceAddress = "";
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(PREF_DEVICE_ADDRESS).apply();
            toast("Saved device address was invalid");
            scanForDeviceChoice();
        }
    }

    private void scanOrDisconnect() {
        if (connected) {
            disconnect();
        } else {
            scanForDeviceChoice();
        }
    }

    private void updateScanDisconnectButton() {
        if (scanDisconnectButton == null) return;
        if (connected) {
            scanDisconnectButton.setText("Disconnect");
            styleButton(scanDisconnectButton, RED);
        } else {
            scanDisconnectButton.setText("Scan");
            styleButton(scanDisconnectButton, PURPLE);
        }
    }

    private void scanForDeviceChoice() {
        if (!hasBlePermission()) { requestBlePermissions(); return; }
        if (adapter == null || !adapter.isEnabled()) {
            startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS));
            return;
        }
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) { toast("No BLE scanner"); return; }
        if (gatt != null) disconnect();
        scannedDevices.clear();
        scannedDeviceLabels.clear();
        scanInProgress = true;
        status.setText("Scanning...");
        scanner.startScan(scanCallback);
        main.postDelayed(() -> {
            if (!scanInProgress) return;
            stopBleScan();
            showDevicePicker();
        }, 8000);
    }

    private void stopBleScan() {
        scanInProgress = false;
        if (scanner != null) {
            try { scanner.stopScan(scanCallback); } catch (Exception ignored) {}
        }
    }

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override public void onScanResult(int callbackType, ScanResult result) {
            BluetoothDevice device = result.getDevice();
            String name = device.getName() == null ? "" : device.getName();
            boolean likely = name.toLowerCase(Locale.ROOT).contains("arcade") || name.toLowerCase(Locale.ROOT).contains("coder");
            if (!likely && result.getScanRecord() != null && result.getScanRecord().getServiceUuids() != null) {
                likely = result.getScanRecord().getServiceUuids().toString().toLowerCase(Locale.ROOT).contains(Protocol.SERVICE_UUID.toString());
            }
            if (!likely) return;
            String address = device.getAddress();
            scannedDevices.put(address, device);
            scannedDeviceLabels.put(address, (name.isEmpty() ? "Arcade Coder" : name) + " | " + address);
            status.setText("Found " + scannedDevices.size() + " Arcade Coder device(s)");
        }
    };

    private void showDevicePicker() {
        if (scannedDevices.isEmpty()) {
            status.setText("No Arcade Coder found");
            return;
        }
        if (scannedDevices.size() == 1) {
            String address = scannedDevices.keySet().iterator().next();
            selectAndConnect(address);
            return;
        }
        List<String> addresses = new ArrayList<>(scannedDevices.keySet());
        String[] labels = new String[addresses.size()];
        for (int i = 0; i < addresses.size(); i++) labels[i] = scannedDeviceLabels.get(addresses.get(i));
        new AlertDialog.Builder(this)
                .setTitle("Choose Arcade Coder")
                .setItems(labels, (dialog, which) -> selectAndConnect(addresses.get(which)))
                .setNegativeButton("Cancel", (dialog, which) -> status.setText("Disconnected"))
                .show();
    }

    private void selectAndConnect(String address) {
        selectedDeviceAddress = address;
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        prefs.edit().putString(PREF_DEVICE_ADDRESS, address).apply();
        connectToDevice(scannedDevices.get(address), scannedDeviceLabels.get(address));
    }

    private void connectToDevice(BluetoothDevice device, String label) {
        if (device == null) { toast("Device unavailable"); return; }
        if (gatt != null) disconnect();
        status.setText("Connecting " + label);
        gatt = device.connectGatt(MainActivity.this, false, gattCallback);
    }

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override public void onConnectionStateChange(BluetoothGatt g, int statusCode, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                connected = true;
                g.requestMtu(517);
                g.discoverServices();
                main.post(() -> { status.setText("Connected"); updateScanDisconnectButton(); });
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                connected = false;
                commandChar = null;
                paintStarted = false;
                main.post(() -> { status.setText("Disconnected"); updateScanDisconnectButton(); });
            }
        }
        @Override public void onServicesDiscovered(BluetoothGatt g, int statusCode) {
            BluetoothGattService service = g.getService(Protocol.SERVICE_UUID);
            commandChar = service == null ? null : service.getCharacteristic(Protocol.COMMAND_CHAR);
            main.post(() -> status.setText(commandChar == null ? "Connected, service not found" : "Connected, ready"));
        }
    };

    private void disconnect() {
        animationRunning = false;
        customAnimationRunning = false;
        if (gatt != null) {
            gatt.disconnect();
            gatt.close();
        }
        gatt = null;
        connected = false;
        commandChar = null;
        paintStarted = false;
        status.setText("Disconnected");
        updateScanDisconnectButton();
    }

    private void startPaint() {
        write(Protocol.startBuiltin("paint"));
        paintStarted = true;
        status.setText("Paint start sent");
    }

    private void sendPixels(boolean startIfNeeded) {
        if (startIfNeeded && !paintStarted) {
            startPaint();
            main.postDelayed(() -> sendPixels(false), 1300);
            return;
        }
        byte[] canvas = Protocol.compactCanvasFromDisplayRgb(pixels);
        write(Protocol.compactCanvasCommand(canvas));
        status.setText("Sent " + canvas.length + " byte canvas");
    }

    private void write(byte[] data) {
        if (gatt == null || commandChar == null) { toast("Not connected"); return; }
        commandChar.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
        commandChar.setValue(data);
        boolean ok = gatt.writeCharacteristic(commandChar);
        if (!ok) toast("BLE write failed to queue");
    }

    private void pickImageFromFiles() {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.setType("image/*");
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        startActivityForResult(Intent.createChooser(intent, "Choose image"), 20);
    }

    private void pickImageFromGallery() {
        Intent intent;
        if (Build.VERSION.SDK_INT >= 33) {
            intent = new Intent(MediaStore.ACTION_PICK_IMAGES);
        } else {
            intent = new Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
            intent.setType("image/*");
        }
        startActivityForResult(intent, 20);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != 20 || resultCode != RESULT_OK || data == null) return;
        try {
            Uri uri = data.getData();
            if (uri == null) return;
            InputStream stream = getContentResolver().openInputStream(uri);
            Bitmap bitmap = BitmapFactory.decodeStream(stream);
            if (bitmap != null) {
                sourceBitmap = bitmap;
                showImagesPage();
            }
        } catch (Exception e) {
            toast(e.getMessage());
        }
    }

    private void sendImageCrop() {
        if (imageCropView != null) {
            int[] sampled = imageCropView.sample12x12();
            System.arraycopy(sampled, 0, pixels, 0, CELL_COUNT);
            Arrays.fill(selected, false);
        }
        sendPixels(true);
    }

    private Bitmap bitmapFromPixels12() {
        Bitmap bitmap = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) bitmap.setPixel(x, y, pixels[y * W + x]);
        return bitmap;
    }

    private class ImageCropView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        private final Paint borderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private Bitmap bitmap;
        private float scale = 1f;
        private float offsetX = 0f;
        private float offsetY = 0f;
        private float lastX = 0f;
        private float lastY = 0f;
        private float startDistance = 0f;
        private float startScale = 1f;
        private boolean fitMode = false;

        ImageCropView(MainActivity context) {
            super(context);
            setBackgroundColor(Color.rgb(226, 232, 239));
            borderPaint.setColor(Color.rgb(93, 107, 122));
            borderPaint.setStyle(Paint.Style.STROKE);
            borderPaint.setStrokeWidth(dp(2));
        }

        void setBitmap(Bitmap bitmap) {
            this.bitmap = bitmap;
            post(this::resetCrop);
        }

        void resetCrop() {
            fitMode = false;
            resetTransform(false);
        }

        void resetFit() {
            fitMode = true;
            resetTransform(true);
        }

        void zoomBy(float factor) {
            if (bitmap == null) return;
            float cx = getWidth() / 2f;
            float cy = getHeight() / 2f;
            float next = clampScale(scale * factor);
            offsetX = cx - (cx - offsetX) * next / scale;
            offsetY = cy - (cy - offsetY) * next / scale;
            scale = next;
            invalidate();
        }

        int[] sample12x12() {
            int[] out = new int[CELL_COUNT];
            Arrays.fill(out, Color.BLACK);
            if (bitmap == null || getWidth() <= 0 || getHeight() <= 0) return out;
            float size = Math.min(getWidth(), getHeight());
            float left = (getWidth() - size) / 2f;
            float top = (getHeight() - size) / 2f;
            for (int y = 0; y < H; y++) {
                for (int x = 0; x < W; x++) {
                    float viewX = left + (x + 0.5f) * size / W;
                    float viewY = top + (y + 0.5f) * size / H;
                    int srcX = Math.round((viewX - offsetX) / scale);
                    int srcY = Math.round((viewY - offsetY) / scale);
                    if (srcX >= 0 && srcY >= 0 && srcX < bitmap.getWidth() && srcY < bitmap.getHeight()) {
                        int c = bitmap.getPixel(srcX, srcY);
                        out[y * W + x] = Color.rgb(Color.red(c), Color.green(c), Color.blue(c));
                    }
                }
            }
            return out;
        }

        @Override protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
            int width = MeasureSpec.getSize(widthMeasureSpec);
            if (width <= 0) width = dp(320);
            setMeasuredDimension(width, width);
        }

        @Override protected void onSizeChanged(int w, int h, int oldw, int oldh) {
            super.onSizeChanged(w, h, oldw, oldh);
            resetTransform(fitMode);
        }

        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float size = Math.min(getWidth(), getHeight());
            float left = (getWidth() - size) / 2f;
            float top = (getHeight() - size) / 2f;
            RectF crop = new RectF(left, top, left + size, top + size);
            canvas.drawColor(Color.rgb(226, 232, 239));
            int save = canvas.save();
            canvas.clipRect(crop);
            canvas.drawColor(Color.rgb(16, 20, 26));
            if (bitmap != null) {
                if (imagePixelPreview) {
                    drawPixelPreview(canvas, crop);
                } else {
                    RectF dest = new RectF(offsetX, offsetY, offsetX + bitmap.getWidth() * scale, offsetY + bitmap.getHeight() * scale);
                    canvas.drawBitmap(bitmap, null, dest, paint);
                }
            }
            canvas.restoreToCount(save);
            canvas.drawRect(crop, borderPaint);
        }

        private void drawPixelPreview(Canvas canvas, RectF crop) {
            int[] sampled = sample12x12();
            float cellW = crop.width() / W;
            float cellH = crop.height() / H;
            Paint pixelPaint = new Paint();
            pixelPaint.setStyle(Paint.Style.FILL);
            for (int y = 0; y < H; y++) {
                for (int x = 0; x < W; x++) {
                    pixelPaint.setColor(sampled[y * W + x]);
                    canvas.drawRect(crop.left + x * cellW, crop.top + y * cellH, crop.left + (x + 1) * cellW, crop.top + (y + 1) * cellH, pixelPaint);
                }
            }
        }

        @Override public boolean onTouchEvent(MotionEvent event) {
            if (bitmap == null) return true;
            int action = event.getActionMasked();
            if (action == MotionEvent.ACTION_DOWN) {
                lastX = event.getX();
                lastY = event.getY();
                return true;
            }
            if (action == MotionEvent.ACTION_POINTER_DOWN && event.getPointerCount() >= 2) {
                startDistance = pointerDistance(event);
                startScale = scale;
                return true;
            }
            if (action == MotionEvent.ACTION_MOVE) {
                if (event.getPointerCount() >= 2) {
                    float distance = pointerDistance(event);
                    if (startDistance > 0f) scale = clampScale(startScale * distance / startDistance);
                } else {
                    offsetX += event.getX() - lastX;
                    offsetY += event.getY() - lastY;
                    lastX = event.getX();
                    lastY = event.getY();
                }
                invalidate();
                return true;
            }
            return true;
        }

        private void resetTransform(boolean fit) {
            if (bitmap == null || getWidth() <= 0 || getHeight() <= 0) return;
            float viewSize = Math.min(getWidth(), getHeight());
            float sx = viewSize / bitmap.getWidth();
            float sy = viewSize / bitmap.getHeight();
            scale = fit ? Math.min(sx, sy) : Math.max(sx, sy);
            offsetX = (getWidth() - bitmap.getWidth() * scale) / 2f;
            offsetY = (getHeight() - bitmap.getHeight() * scale) / 2f;
            invalidate();
        }

        private float clampScale(float value) {
            return Math.max(0.08f, Math.min(24f, value));
        }

        private float pointerDistance(MotionEvent event) {
            float dx = event.getX(0) - event.getX(1);
            float dy = event.getY(0) - event.getY(1);
            return (float)Math.sqrt(dx * dx + dy * dy);
        }
    }

    private Map<String, String> pcAnimationScripts() {
        Map<String, String> scripts = new LinkedHashMap<>();
        scripts.put("pet blink", "// Tiny pet face. Blinks every 8 frames.\nconst blink = i % 8 === 0 || i % 8 === 1;\nrect(3, 3, 6, 6, 60, 180, 90);\nset(4, 5, 0, 0, 0);\nset(7, 5, 0, 0, 0);\nif (blink) {\n  line(4, 5, 5, 5, 60, 180, 90);\n  line(7, 5, 8, 5, 60, 180, 90);\n}\nline(5, 7, 6, 8, 0, 0, 0);\nline(6, 8, 7, 7, 0, 0, 0);");
        scripts.put("pet walk", "// Tiny pet walking in place.\nconst bob = i % 2;\nrect(4, 3 + bob, 4, 4, 90, 200, 120);\nset(5, 5 + bob, 0, 0, 0); set(7, 5 + bob, 0, 0, 0);\nset(4, 7 + bob, 40, 120, 60); set(7, 7 + (1 - bob), 40, 120, 60);\nset(3, 6 + bob, 90, 200, 120); set(8, 6 + bob, 90, 200, 120);");
        scripts.put("pet sleep", "// Sleeping pet with drifting Zs.\nrect(3, 6, 6, 3, 60, 150, 90);\nline(4, 7, 5, 7, 0, 0, 0); line(7, 7, 8, 7, 0, 0, 0);\nconst z = i % 6;\ntext('111|001|111', 7 - z, 1 + Math.floor(z / 2), 80, 120, 255);");
        scripts.put("pet hungry", "// Hungry pet plus food dot.\nrect(3, 3, 6, 6, 220, 160, 50);\nset(4, 5, 0, 0, 0); set(7, 5, 0, 0, 0);\nline(5, 8, 7, 8, 0, 0, 0);\nset(10, 8 + (i % 2), 255, 0, 0);");
        scripts.put("pet happy", "// Happy pet bounce.\nconst y = 3 + (i % 2);\nrect(3, y, 6, 5, 80, 220, 110);\nset(4, y + 2, 0, 0, 0); set(7, y + 2, 0, 0, 0);\nline(4, y + 4, 5, y + 5, 0, 0, 0); line(5, y + 5, 7, y + 5, 0, 0, 0); line(7, y + 5, 8, y + 4, 0, 0, 0);");
        scripts.put("pet sick", "// Sick pet, green and wobbling.\nconst x = 3 + (i % 3 === 0 ? -1 : 0);\nrect(x, 4, 6, 5, 120, 210, 70);\nset(x + 1, 6, 0, 0, 0); set(x + 4, 6, 0, 0, 0);\nline(x + 2, 8, x + 4, 8, 0, 0, 0);\nset(9, 2, 130, 255, 70); set(10, 3, 130, 255, 70);");
        scripts.put("bounce", "// Bouncing dot with trail.\nconst x = Math.abs((i % 22) - 11);\nconst y = 5 + Math.round(Math.sin(i / 2) * 4);\nfor (let n = 0; n < 5; n++) {\n  const xx = Math.abs(((i - n) % 22) - 11);\n  const yy = 5 + Math.round(Math.sin((i - n) / 2) * 4);\n  set(xx, yy, 255 - n * 40, 80, 20);\n}");
        scripts.put("rainbow scanner", "// Sweeping rainbow bar.\nconst x = i % W;\nfor (let y = 0; y < H; y++) {\n  const [r,g,b] = hsv((i * 18 + y * 20) % 360, 1, 1);\n  set(x, y, r, g, b);\n  if (x > 0) set(x - 1, y, r * 0.25, g * 0.25, b * 0.25);\n}");
        scripts.put("rain", "// Falling rain.\nfor (let x = 0; x < W; x++) {\n  const y = (i + x * 3) % H;\n  set(x, y, 0, 80, 255);\n  set(x, (y + H - 1) % H, 0, 20, 80);\n}");
        scripts.put("snow", "// Soft snow drift.\nfor (let n = 0; n < 18; n++) {\n  const x = (n * 5 + Math.floor(i / 3)) % W;\n  const y = (i + n * 4) % H;\n  set(x, y, 220, 240, 255);\n}");
        scripts.put("sparkle", "// Twinkling stars that flare and slowly fade out.\nfade(0.8);\nfor (let n = 0; n < 2; n++) {\n  if (rand(1) < 0.7) {\n    const warm = rand(1) < 0.35;\n    set(Math.floor(rand(W)), Math.floor(rand(H)), 255, warm ? 190 : 245, warm ? 110 : 255);\n  }\n}");
        scripts.put("heart pulse", "// Heart shape with pulsing brightness.\nconst pts = [[3,3],[4,2],[5,2],[6,3],[7,2],[8,2],[9,3],[2,4],[10,4],[2,5],[10,5],[3,6],[9,6],[4,7],[8,7],[5,8],[7,8],[6,9]];\nconst v = 0.45 + 0.55 * Math.abs(Math.sin(i / 3));\nfor (const [x,y] of pts) set(x, y, 255 * v, 20 * v, 60 * v);");
        scripts.put("fire", "// Fire sim: heat rises from embers and cools as it climbs.\nif (!state.heat) state.heat = new Array(W * H).fill(0);\nconst heat = state.heat;\nfor (let x = 0; x < W; x++) heat[(H - 1) * W + x] = 140 + rand(115);\nheat[(H - 1) * W + Math.floor(rand(W))] = 255;\nfor (let y = 0; y < H - 1; y++) {\n  for (let x = 0; x < W; x++) {\n    const sx = Math.max(0, Math.min(W - 1, x + Math.floor(rand(3)) - 1));\n    heat[y * W + x] = Math.max(0, heat[(y + 1) * W + sx] - 6 - rand(26));\n  }\n}\nfor (let y = 0; y < H; y++) {\n  for (let x = 0; x < W; x++) {\n    const h = heat[y * W + x];\n    if (h > 15) set(x, y, Math.min(255, h * 1.7), Math.max(0, (h - 80) * 1.6), Math.max(0, (h - 190) * 3));\n  }\n}");
        scripts.put("matrix rain", "// Digital rain with varied column speeds and glowing trails.\nfade(0.6);\nif (!state.cols) state.cols = Array.from({ length: W }, () => ({ y: rand(H), sp: 0.35 + rand(0.85) }));\nfor (let x = 0; x < W; x++) {\n  const c = state.cols[x];\n  c.y += c.sp;\n  if (c.y > H + 4) { c.y = -rand(8); c.sp = 0.35 + rand(0.85); }\n  set(x, c.y, 190, 255, 190);\n  set(x, c.y - 1, 0, 200, 60);\n}");
        scripts.put("comet", "// Comet on a lissajous orbit, tail from fading afterglow.\nfade(0.7);\nconst x = 5.5 + Math.cos(i / 4) * 4.8;\nconst y = 5.5 + Math.sin(i / 2.6) * 4.4;\nset(x, y, 255, 255, 255);\nset(x + 0.8, y, 120, 190, 255);\nset(x, y + 0.8, 120, 190, 255);");
        scripts.put("spinner", "// Loading spinner.\nconst arms = [[6,2],[8,3],[10,5],[9,8],[6,10],[3,9],[2,6],[3,3]];\nfor (let n = 0; n < arms.length; n++) {\n  const [x,y] = arms[n];\n  const v = ((n - i) % arms.length + arms.length) % arms.length;\n  set(x, y, 255 - v * 25, 255 - v * 25, 255);\n}\nset(6,6,120,120,255);");
        scripts.put("equalizer", "// Fake audio bars.\nfor (let x = 0; x < W; x++) {\n  const h = 1 + Math.floor((Math.sin(i / 2 + x) + 1) * 5.5);\n  const [r,g,b] = hsv(x * 25, 1, 1);\n  for (let y = 0; y < h; y++) set(x, H - 1 - y, r, g, b);\n}");
        scripts.put("clock sweep", "// Second-hand style sweep.\nconst a = i / 12 * Math.PI * 2;\nconst cx = 5.5, cy = 5.5;\nfor (let n = 0; n < 6; n++) {\n  const x = Math.round(cx + Math.cos(a) * n);\n  const y = Math.round(cy + Math.sin(a) * n);\n  set(x, y, 255, 255, 255);\n}\nset(5,5,255,0,0); set(6,6,255,0,0);");
        scripts.put("orbit", "// Two dots orbiting.\nfor (let n = 0; n < 2; n++) {\n  const a = i / 5 + n * Math.PI;\n  set(Math.round(5.5 + Math.cos(a) * 4), Math.round(5.5 + Math.sin(a) * 4), n ? 255 : 0, 80, n ? 80 : 255);\n}");
        scripts.put("checker wave", "// Colour checker wave.\nfor (let y = 0; y < H; y++) {\n  for (let x = 0; x < W; x++) {\n    if ((x + y + i) % 3 === 0) {\n      const [r,g,b] = hsv((x * 20 + y * 20 + i * 15) % 360, 1, 1);\n      set(x, y, r, g, b);\n    }\n  }\n}");
        scripts.put("wipe", "// Horizontal wipe.\nconst n = i % (W + 1);\nfor (let x = 0; x < n; x++) rect(x, 0, 1, H, 30, 180, 255);");
        scripts.put("box grow", "// Growing box.\nconst n = 1 + (i % 6);\nrect(6 - n, 6 - n, n * 2, n * 2, 255, 80, 30);");
        scripts.put("eyes look", "// Eyes looking around.\nconst look = [[0,0],[1,0],[0,1],[-1,0],[0,-1]][i % 5];\nrect(2,3,3,4,255,255,255); rect(7,3,3,4,255,255,255);\nset(3 + look[0], 5 + look[1], 0,0,0); set(8 + look[0], 5 + look[1], 0,0,0);");
        scripts.put("smile", "// Smiley blink.\nconst blink = i % 10 < 2;\nif (blink) { line(3,4,4,4,255,255,0); line(8,4,9,4,255,255,0); }\nelse { set(4,4,255,255,0); set(8,4,255,255,0); }\nline(3,7,4,8,255,255,0); line(4,8,7,8,255,255,0); line(7,8,8,7,255,255,0);");
        scripts.put("hi text", "// Proper chunky HI.\ntext('1010111|1010010|1110010|1010010|1010111', 2, 3, 255, 255, 255);");
        scripts.put("love text", "// Alternates HI and heart.\nif (i % 12 < 6) {\n  text('1010111|1010010|1110010|1010010|1010111', 2, 3, 255, 255, 255);\n} else {\n  const pts = [[4,3],[5,3],[7,3],[8,3],[3,4],[6,4],[9,4],[3,5],[9,5],[4,6],[8,6],[5,7],[7,7],[6,8]];\n  for (const p of pts) set(p[0], p[1], 255, 20, 80);\n}");
        scripts.put("progress", "// Progress bar around edge.\nconst total = 44;\nconst lit = i % (total + 1);\nconst edge = [];\nfor (let x=0;x<W;x++) edge.push([x,0]);\nfor (let y=1;y<H;y++) edge.push([W-1,y]);\nfor (let x=W-2;x>=0;x--) edge.push([x,H-1]);\nfor (let y=H-2;y>0;y--) edge.push([0,y]);\nfor (let n=0;n<lit;n++) { const [x,y]=edge[n]; set(x,y,80,255,120); }");
        scripts.put("alert flash", "// Red alert flash.\nif (i % 2 === 0) {\n  rect(0,0,W,H,255,0,0);\n  text('111010111|010010100|010010111|010010100|010111111', 1, 3, 0,0,0);\n}");
        scripts.put("bouncy ball", "// Ball with gravity, bounce, squash and a colour-cycling trail.\nfade(0.5);\nif (!state.ball) state.ball = { x: 2, y: 2, vx: 0.5, vy: 0 };\nconst b = state.ball;\nb.vy += 0.12; b.x += b.vx; b.y += b.vy;\nif (b.x < 0.5) { b.x = 0.5; b.vx = Math.abs(b.vx); }\nif (b.x > 10.5) { b.x = 10.5; b.vx = -Math.abs(b.vx); }\nlet squash = false;\nif (b.y >= 10) { b.y = 10; b.vy = -Math.abs(b.vy) * 0.97 - 0.08; squash = true; }\nconst [r, g, bl] = hsv((i * 7) % 360, 1, 1);\nline(0, 11, 11, 11, 50, 50, 70);\nif (squash) rect(Math.round(b.x) - 1, 10, 3, 1, r, g, bl);\nelse { set(b.x, b.y, r, g, bl); set(b.x, b.y - 1, r * 0.4, g * 0.4, bl * 0.4); }");
        scripts.put("ocean waves", "// Rolling sea with foam on the crests.\nfor (let x = 0; x < W; x++) {\n  const s = Math.sin((x + i * 0.8) / 2.2) * 1.4 + Math.sin((x - i * 0.5) / 3.1) * 1.1;\n  const top = Math.round(5 + s);\n  for (let y = Math.max(0, top); y < H; y++) {\n    const depth = (y - top) / ((H - top) || 1);\n    set(x, y, 10 * (1 - depth), 60 + 110 * (1 - depth), 150 + 90 * (1 - depth));\n  }\n  if ((x + i) % 5 === 0) set(x, top, 235, 245, 255);\n}");
        scripts.put("aurora", "// Aurora curtains drifting over a starry sky.\nif (!state.stars) state.stars = Array.from({ length: 10 }, () => [Math.floor(rand(W)), Math.floor(rand(H))]);\nfor (const [sx, sy] of state.stars) if (rand(1) < 0.9) set(sx, sy, 70, 70, 95);\nfor (let x = 0; x < W; x++) {\n  const base = 2.5 + Math.sin((x + i * 0.55) / 2.4) * 2 + Math.sin((x * 1.7 - i * 0.3) / 3) * 1.2;\n  for (let y = 0; y < H; y++) {\n    const d = y - base;\n    if (d > 0 && d < 6) {\n      const v = (1 - d / 6) * (0.45 + 0.55 * Math.sin((x * 2 + i) / 3) ** 2);\n      const purple = d > 3.5;\n      set(x, y, purple ? 130 * v : 10 * v, purple ? 60 * v : 230 * v, purple ? 200 * v : 120 * v);\n    }\n  }\n}");
        scripts.put("game of life", "// Conway's Game of Life on a wrapping grid, reseeds when it dies down.\nconst reseed = () => Array.from({ length: W * H }, () => (rand(1) < 0.3 ? 1 : 0));\nif (!state.cells) state.cells = reseed();\nconst cur = state.cells;\nconst next = new Array(W * H).fill(0);\nlet alive = 0;\nfor (let y = 0; y < H; y++) {\n  for (let x = 0; x < W; x++) {\n    let n = 0;\n    for (let dy = -1; dy <= 1; dy++) {\n      for (let dx = -1; dx <= 1; dx++) {\n        if (dx || dy) n += cur[((y + dy + H) % H) * W + ((x + dx + W) % W)];\n      }\n    }\n    const on = cur[y * W + x] ? n === 2 || n === 3 : n === 3;\n    if (on) {\n      next[y * W + x] = 1;\n      alive += 1;\n      const [r, g, b] = hsv((x * 10 + y * 10 + i * 3) % 360, 0.75, 1);\n      set(x, y, r, g, b);\n    }\n  }\n}\nstate.cells = alive < 6 || i % 120 === 119 ? reseed() : next;");
        scripts.put("rainbow swirl", "// Rotating rainbow spiral.\nfor (let y = 0; y < H; y++) {\n  for (let x = 0; x < W; x++) {\n    const a = Math.atan2(y - 5.5, x - 5.5);\n    const dist = Math.hypot(x - 5.5, y - 5.5);\n    const [r, g, b] = hsv(((a / Math.PI) * 180 + dist * 30 - i * 14 + 1080) % 360, 1, 1);\n    set(x, y, r, g, b);\n  }\n}");
        scripts.put("claude wave", "// Sine wave ripple\nfor (let x = 0; x < W; x++) {\n  const y = Math.round(5.5 + Math.sin((x + i) / 2) * 4);\n  const [r,g,b] = hsv((x * 30 + i * 10) % 360, 1, 1);\n  set(x, y, r, g, b);\n}");
        scripts.put("claude plasma", "// Plasma effect\nfor (let y = 0; y < H; y++) {\n  for (let x = 0; x < W; x++) {\n    const v = Math.sin(x / 2 + i / 4) + Math.sin(y / 2 + i / 4) + Math.sin((x + y) / 3 + i / 4);\n    const [r,g,b] = hsv((v * 60 + i * 10) % 360, 1, 0.8);\n    set(x, y, r, g, b);\n  }\n}");
        scripts.put("claude tunnel", "// Tunnel zoom effect\nconst zoom = (i % 20) / 20;\nfor (let y = 0; y < H; y++) {\n  for (let x = 0; x < W; x++) {\n    const dx = x - 5.5, dy = y - 5.5;\n    const d = Math.sqrt(dx*dx + dy*dy);\n    if (d > 2 * zoom && d < 6 * zoom) {\n      const [r,g,b] = hsv((d * 40 + i * 20) % 360, 1, 1);\n      set(x, y, r, g, b);\n    }\n  }\n}");
        scripts.put("claude spiral", "// Rotating spiral\nconst cx = 5.5, cy = 5.5;\nfor (let n = 0; n < 40; n++) {\n  const a = (i + n) / 8;\n  const r = n / 8;\n  const x = Math.round(cx + Math.cos(a) * r);\n  const y = Math.round(cy + Math.sin(a) * r);\n  const [rr,g,b] = hsv((n * 15 + i * 10) % 360, 1, 1);\n  set(x, y, rr, g, b);\n}");
        scripts.put("claude DNA", "// DNA double helix\nfor (let x = 0; x < W; x++) {\n  const y1 = Math.round(5.5 + Math.sin((x + i) / 2) * 3);\n  const y2 = Math.round(5.5 - Math.sin((x + i) / 2) * 3);\n  set(x, y1, 0, 200, 255);\n  set(x, y2, 255, 100, 0);\n  if (x % 3 === (i % 3)) line(x, y1, x, y2, 100, 100, 100);\n}");
        scripts.put("claude ripple", "// Circular ripple\nconst cx = 5.5, cy = 5.5;\nfor (let y = 0; y < H; y++) {\n  for (let x = 0; x < W; x++) {\n    const dx = x - cx, dy = y - cy;\n    const d = Math.sqrt(dx*dx + dy*dy);\n    const wave = Math.sin(d - i / 2) * 0.5 + 0.5;\n    set(x, y, 255 * wave, 100 * wave, 200 * wave);\n  }\n}");
        scripts.put("claude starfield", "// Warp-speed starfield radiating from centre with streaks.\nfade(0.55);\nif (!state.stars) state.stars = Array.from({ length: 16 }, () => ({ a: rand(Math.PI * 2), d: rand(5) }));\nfor (const st of state.stars) {\n  st.d += 0.2 + st.d * 0.22;\n  if (st.d > 8.5) { st.a = rand(Math.PI * 2); st.d = 0.3; }\n  const v = Math.min(1, st.d / 4.5);\n  set(5.5 + Math.cos(st.a) * st.d, 5.5 + Math.sin(st.a) * st.d, 255 * v, 255 * v, 255);\n}");
        scripts.put("claude radar", "// Radar sweep with phosphor afterglow and red contacts.\nfade(0.8);\nconst a = i / 4;\nfor (let r = 0; r < 6.5; r += 0.4) set(5.5 + Math.cos(a) * r, 5.5 + Math.sin(a) * r, 40, 255, 90);\nfor (const [bx, by] of [[9, 3], [2, 8], [8, 9]]) {\n  let d = (a - Math.atan2(by - 5.5, bx - 5.5)) % (Math.PI * 2);\n  if (d < 0) d += Math.PI * 2;\n  if (d < 1.4) set(bx, by, 255, 70, 60);\n}");
        scripts.put("claude knight rider", "// KITT scanner\nconst x = Math.abs((i % (W * 2)) - W);\nfor (let n = 0; n < 4; n++) {\n  const xx = x - n;\n  if (xx >= 0 && xx < W) set(xx, 5, 255 - n * 50, 0, 0);\n  if (xx >= 0 && xx < W) set(xx, 6, 255 - n * 50, 0, 0);\n}");
        scripts.put("claude tetris", "// Falling blocks\nconst block = [[0,0],[1,0],[0,1],[1,1]];\nconst y = (i % 12);\nfor (const [bx, by] of block) {\n  set(4 + bx, y + by, 255, 0, 200);\n  set(7 + bx, y + by, 0, 255, 200);\n}");
        scripts.put("claude meteor", "// Meteor shower\nfor (let n = 0; n < 8; n++) {\n  const t = (i + n * 15) % 20;\n  const x = n + Math.floor(t / 2);\n  const y = t;\n  for (let trail = 0; trail < 4; trail++) {\n    const xx = x - trail;\n    const yy = y - trail;\n    if (xx >= 0 && yy >= 0) set(xx, yy, 255 - trail * 60, 200 - trail * 50, 100 - trail * 25);\n  }\n}");
        scripts.put("claude pac", "// Pac-Man chomps a dot trail, ghost in pursuit.\nconst px = ((i * 0.8) % (W + 8)) - 4;\nfor (let x = 1; x < W; x += 2) if (x > px + 1) set(x, 6, 255, 220, 150);\nconst mouthOpen = i % 2 === 0;\nfor (let dy = -1; dy <= 1; dy++) {\n  for (let dx = -1; dx <= 1; dx++) {\n    if (mouthOpen && dx === 1 && dy !== -1) continue;\n    set(px + dx, 6 + dy, 255, 230, 0);\n  }\n}\nconst gx = px - 4;\nfor (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) set(gx + dx, 6 + dy, 255, 70, 120);\nset(gx - 0.5, 5, 255, 255, 255);\nset(gx + 1, 5, 255, 255, 255);");
        scripts.put("claude sine bars", "// Vertical sine bars\nfor (let x = 0; x < W; x++) {\n  const h = Math.round((Math.sin(x / 2 + i / 3) + 1) * 5);\n  for (let y = 0; y < h; y++) {\n    const [r,g,b] = hsv(x * 30, 1, 1);\n    set(x, H - 1 - y, r, g, b);\n  }\n}");
        scripts.put("claude kaleidoscope", "// Kaleidoscope\nfor (let y = 0; y < H / 2; y++) {\n  for (let x = 0; x < W / 2; x++) {\n    const val = ((x + y + i) % 4) === 0;\n    if (val) {\n      const [r,g,b] = hsv((x * 20 + y * 20 + i * 10) % 360, 1, 1);\n      set(x, y, r, g, b);\n      set(W - 1 - x, y, r, g, b);\n      set(x, H - 1 - y, r, g, b);\n      set(W - 1 - x, H - 1 - y, r, g, b);\n    }\n  }\n}");
        scripts.put("claude lightning", "// Lightning bolt\nconst pts = [[6,0],[5,3],[6,3],[5,6],[6,6],[4,9],[6,9],[3,11]];\nconst on = i % 6 < 1;\nif (on) for (const [x,y] of pts) set(x, y, 200, 200, 255);");
        scripts.put("claude vortex", "// Rotating vortex\nconst cx = 5.5, cy = 5.5;\nfor (let y = 0; y < H; y++) {\n  for (let x = 0; x < W; x++) {\n    const dx = x - cx, dy = y - cy;\n    const angle = Math.atan2(dy, dx) + i / 10;\n    const d = Math.sqrt(dx*dx + dy*dy);\n    const val = Math.sin(angle * 3 + d - i / 3) * 0.5 + 0.5;\n    set(x, y, 255 * val, 100 * val, 255 * val);\n  }\n}");
        scripts.put("claude pixels fade", "// Random pixel fade\nfor (let n = 0; n < 20; n++) {\n  const x = (n * 7 + i * 3) % W;\n  const y = (n * 5 + i * 2) % H;\n  const fade = ((i + n) % 12) / 12;\n  set(x, y, 255 * fade, 150 * fade, 200 * fade);\n}");
        scripts.put("claude binary rain", "// Binary code rain\nfor (let x = 0; x < W; x++) {\n  const h = (i + x * 3) % H;\n  const val = ((i + x) % 2) ? 255 : 0;\n  set(x, h, val, 255, val);\n  set(x, (h + H - 1) % H, 0, 150, 0);\n}");
        scripts.put("claude xmas", "// Christmas tree\nconst tree = [[5,2],[4,3],[5,3],[6,3],[3,4],[4,4],[5,4],[6,4],[7,4],[3,5],[4,5],[5,5],[6,5],[7,5],[2,6],[3,6],[4,6],[5,6],[6,6],[7,6],[8,6],[5,7],[5,8]];\nfor (const [x,y] of tree) {\n  if (y < 7) set(x, y, 0, 150 + (i % 2) * 100, 0);\n  else set(x, y, 139, 69, 19);\n}\nif (i % 4 < 2) set(5, 2, 255, 255, 0);");
        scripts.put("claude circle pulse", "// Pulsing circle\nconst r = 2 + Math.floor((i % 8) / 2);\nconst cx = 5.5, cy = 5.5;\nfor (let y = 0; y < H; y++) {\n  for (let x = 0; x < W; x++) {\n    const dx = x - cx, dy = y - cy;\n    const d = Math.sqrt(dx*dx + dy*dy);\n    if (Math.abs(d - r) < 0.7) set(x, y, 255, 100, 200);\n  }\n}");
        scripts.put("claude diamond", "// Rotating diamond\nconst pts = [[6,1],[9,4],[6,7],[3,4]];\nfor (let n = 0; n < pts.length; n++) {\n  const [x,y] = pts[(i + n) % pts.length];\n  set(x, y, 255 - n * 60, 255 - n * 60, 255);\n}\nline(6,1,9,4,100,100,255);\nline(9,4,6,7,100,100,255);\nline(6,7,3,4,100,100,255);\nline(3,4,6,1,100,100,255);");
        scripts.put("claude hourglass", "// Sand falling\nconst y = i % H;\nrect(2, 0, 8, 1, 200, 200, 200);\nrect(2, 11, 8, 1, 200, 200, 200);\nif (y < 5) set(5 + (y % 2), y, 255, 200, 100);\nelse if (y > 6) set(6 - ((y - 7) % 2), y, 255, 200, 100);");
        scripts.put("claude zebra", "// Zebra stripes scroll\nfor (let y = 0; y < H; y++) {\n  if ((y + i) % 3 === 0) rect(0, y, W, 1, 255, 255, 255);\n}");
        scripts.put("claude lava lamp", "// Metaball lava lamp: blobs drift, merge and split.\nif (!state.blobs) state.blobs = [0, 1, 2].map((n) => ({ x: 3 + n * 3, y: 3 + n * 2.5, vx: 0.12 + rand(0.14), vy: 0.09 + rand(0.16) }));\nfor (const bl of state.blobs) {\n  bl.x += bl.vx; bl.y += bl.vy;\n  if (bl.x < 1 || bl.x > 10) bl.vx *= -1;\n  if (bl.y < 1 || bl.y > 10) bl.vy *= -1;\n}\nfor (let y = 0; y < H; y++) {\n  for (let x = 0; x < W; x++) {\n    let f = 0;\n    for (const bl of state.blobs) {\n      const dx = x - bl.x, dy = y - bl.y;\n      f += 2.2 / (0.4 + dx * dx + dy * dy);\n    }\n    if (f > 0.55) {\n      const v = Math.min(1, (f - 0.55) * 1.5);\n      set(x, y, 180 + 75 * v, 30 + 130 * v, 10 * v);\n    }\n  }\n}");
        scripts.put("claude targeting", "// Targeting reticle\nconst cx = 5.5 + Math.sin(i / 5) * 2;\nconst cy = 5.5 + Math.cos(i / 5) * 2;\nconst x = Math.round(cx), y = Math.round(cy);\nline(x - 2, y, x + 2, y, 255, 0, 0);\nline(x, y - 2, x, y + 2, 255, 0, 0);\nrect(x - 3, y - 3, 7, 1, 0, 255, 0);\nrect(x - 3, y + 3, 7, 1, 0, 255, 0);\nrect(x - 3, y - 3, 1, 7, 0, 255, 0);\nrect(x + 3, y - 3, 1, 7, 0, 255, 0);");
        scripts.put("claude thermometer", "// Temperature rising\nconst h = 1 + (i % 10);\nrect(5, 11 - h, 2, h, 255, 0, 0);\nrect(5, 0, 2, 11 - h, 100, 100, 100);");
        scripts.put("claude loading dots", "// Loading animation\nconst dots = [3, 5, 7, 9];\nfor (let n = 0; n < dots.length; n++) {\n  const bright = ((i + n * 2) % 8) / 8;\n  set(dots[n], 6, 255 * bright, 255 * bright, 255 * bright);\n}");
        scripts.put("claude arrows", "// Flowing arrows\nfor (let y = 0; y < H; y += 3) {\n  const x = (i + y) % W;\n  text('111.1|.1.1|..1.', x, y, 0, 255, 255);\n}");
        scripts.put("claude neon sign", "// Flickering neon\nconst flicker = (i % 8) < 7;\nif (flicker) {\n  text('10101|01010|10101|01010|10101', 1, 3, 255, 0, 200);\n}");
        scripts.put("claude radar blip", "// Radar with blips\nfor (let r = 1; r < 6; r++) {\n  for (let a = 0; a < Math.PI * 2; a += 0.5) {\n    const x = Math.round(5.5 + Math.cos(a) * r);\n    const y = Math.round(5.5 + Math.sin(a) * r);\n    set(x, y, 0, 50, 0);\n  }\n}\nconst a = (i / 5) * Math.PI * 2;\nfor (let r = 0; r < 6; r++) {\n  set(Math.round(5.5 + Math.cos(a) * r), Math.round(5.5 + Math.sin(a) * r), 0, 255, 0);\n}\nif (i % 12 < 2) set(8, 3, 255, 0, 0);");
        scripts.put("claude breathing", "// Breathing glow\nconst v = (Math.sin(i / 4) + 1) / 2;\nfor (let r = 0; r < 5; r++) {\n  for (let a = 0; a < Math.PI * 2; a += 0.3) {\n    const x = Math.round(5.5 + Math.cos(a) * r);\n    const y = Math.round(5.5 + Math.sin(a) * r);\n    set(x, y, 100 * v, 150 * v, 255 * v);\n  }\n}");
        scripts.put("claude conveyor", "// Conveyor belt\nfor (let x = 0; x < W; x++) {\n  if ((x + i) % 4 < 2) {\n    rect(x, 5, 1, 2, 200, 200, 200);\n  }\n}\nconst box = (i % W);\nrect(box, 3, 2, 2, 200, 100, 0);");
        scripts.put("claude disco", "// Disco floor\nfor (let y = 0; y < H; y++) {\n  for (let x = 0; x < W; x++) {\n    if ((x + y + i) % 3 === 0) {\n      const [r,g,b] = hsv(((x + y) * 40 + i * 20) % 360, 1, 1);\n      set(x, y, r, g, b);\n    }\n  }\n}");
        scripts.put("claude warp speed", "// Warp speed stars\nfor (let n = 0; n < 15; n++) {\n  const z = ((i + n * 5) % 30) / 30;\n  const len = Math.floor(z * 4);\n  const x = 5 + ((n % 5) - 2);\n  const y = Math.round(5.5 - (1 - z) * 5);\n  for (let l = 0; l < len; l++) {\n    set(x, y + l, 200, 200, 255);\n  }\n}");
        scripts.put("claude crosshair", "// Moving crosshair\nconst x = 2 + (i % 8);\nconst y = 2 + ((i * 2) % 8);\nline(x, 0, x, H - 1, 255, 0, 0);\nline(0, y, W - 1, y, 255, 0, 0);\nset(x, y, 255, 255, 0);");
        scripts.put("claude sonar", "// Sonar ping\nconst r = (i % 10) * 1.2;\nconst cx = 5.5, cy = 5.5;\nfor (let a = 0; a < Math.PI * 2; a += 0.2) {\n  const x = Math.round(cx + Math.cos(a) * r);\n  const y = Math.round(cy + Math.sin(a) * r);\n  set(x, y, 0, 255 - r * 20, 255 - r * 20);\n}");
        scripts.put("claude squares", "// Concentric squares\nconst s = i % 6;\nrect(5 - s, 5 - s, 1 + s * 2, 1 + s * 2, 255, 100, 200);");
        scripts.put("claude bubbles", "// Rising bubbles\nfor (let n = 0; n < 6; n++) {\n  const x = (n * 2) % W;\n  const y = H - 1 - ((i + n * 7) % H);\n  set(x, y, 100, 200, 255);\n  if (y > 0) set(x, y - 1, 150, 220, 255);\n}");
        scripts.put("claude rain drops", "// Rain with splashes\nfor (let n = 0; n < 8; n++) {\n  const x = (n * 3) % W;\n  const y = (i + n * 4) % H;\n  set(x, y, 100, 150, 255);\n  if (y === H - 1) {\n    set(x - 1, y, 150, 200, 255);\n    set(x + 1, y, 150, 200, 255);\n  }\n}");
        scripts.put("claude pong", "// Pong game\nconst ballX = Math.abs((i % (W * 2)) - W);\nconst ballY = 5 + Math.floor(Math.sin(i / 3) * 3);\nset(ballX, ballY, 255, 255, 255);\nconst paddle1 = 4 + Math.floor(Math.sin(i / 4) * 2);\nconst paddle2 = 4 + Math.floor(Math.cos(i / 4) * 2);\nfor (let y = paddle1; y < paddle1 + 3; y++) set(0, y, 255, 0, 0);\nfor (let y = paddle2; y < paddle2 + 3; y++) set(W - 1, y, 0, 0, 255);");
        scripts.put("claude snake", "// Snake that actually hunts the food and grows.\nif (!state.snake) { state.snake = [[2, 5], [1, 5], [0, 5]]; state.food = [9, 5]; state.dir = [1, 0]; }\nconst s = state.snake, f = state.food, h = s[0];\nconst cand = [];\nif (f[0] !== h[0]) cand.push([Math.sign(f[0] - h[0]), 0]);\nif (f[1] !== h[1]) cand.push([0, Math.sign(f[1] - h[1])]);\nconst d = cand.find((c) => !(c[0] === -state.dir[0] && c[1] === -state.dir[1])) || state.dir;\nstate.dir = d;\nconst nh = [(h[0] + d[0] + W) % W, (h[1] + d[1] + H) % H];\ns.unshift(nh);\nif (nh[0] === f[0] && nh[1] === f[1]) {\n  state.food = [Math.floor(rand(W)), Math.floor(rand(H))];\n  if (s.length > 22) s.length = 22;\n} else {\n  s.pop();\n}\nset(f[0], f[1], 255, 60, 60);\ns.forEach(([x, y], n) => { const v = Math.max(0.2, 1 - n / (s.length + 2)); set(x, y, 60 * v, 255 * v, 90 * v); });");
        scripts.put("claude fireworks", "// Fireworks with gravity, drag and fading trails.\nfade(0.72);\nif (!state.parts) { state.parts = []; state.next = 0; }\nif (i >= state.next) {\n  const cx = 2 + rand(8), cy = 1 + rand(4);\n  const [r, g, b] = hsv(rand(360), 1, 1);\n  for (let n = 0; n < 26; n++) {\n    const a = rand(Math.PI * 2), sp = 0.35 + rand(1.1);\n    state.parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 9 + rand(9), r, g, b });\n  }\n  state.next = i + 5 + Math.floor(rand(7));\n}\nstate.parts = state.parts.filter((p) => p.life > 0);\nfor (const p of state.parts) {\n  p.x += p.vx; p.y += p.vy;\n  p.vy += 0.07; p.vx *= 0.93; p.vy *= 0.93;\n  p.life -= 1;\n  const v = Math.min(1, p.life / 8);\n  set(p.x, p.y, p.r * v, p.g * v, p.b * v);\n}");
        scripts.put("claude tv static", "// TV static noise\nfor (let y = 0; y < H; y++) {\n  for (let x = 0; x < W; x++) {\n    const v = ((x * 17 + y * 13 + i * 7) % 3) === 0 ? 255 : 0;\n    set(x, y, v, v, v);\n  }\n}");
        scripts.put("claude barcode", "// Scrolling barcode\nfor (let x = 0; x < W; x++) {\n  if (((x + i) % 7) < 3) rect(x, 0, 1, H, 0, 0, 0);\n  else rect(x, 0, 1, H, 255, 255, 255);\n}");
        scripts.put("claude pac dots", "// Pac-Man eating dots\nconst px = (i % W);\nset(px, 6, 255, 255, 0);\nfor (let x = 0; x < W; x++) {\n  if (x > px && x % 2 === 0) set(x, 6, 255, 255, 255);\n}");
        scripts.put("claude slot machine", "// Slot machine reels\nconst r1 = (i % 4), r2 = ((i * 2) % 4), r3 = ((i * 3) % 4);\nconst symbols = ['111|101|111', '010|111|010', '111|111|111', '101|111|101'];\ntext(symbols[r1], 0, 4, 255, 0, 0);\ntext(symbols[r2], 4, 4, 0, 255, 0);\ntext(symbols[r3], 8, 4, 0, 0, 255);");
        scripts.put("claude spin cycle", "// Washing machine\nfor (let n = 0; n < 8; n++) {\n  const a = (i / 4 + n * Math.PI / 4) % (Math.PI * 2);\n  const x = Math.round(5.5 + Math.cos(a) * 4);\n  const y = Math.round(5.5 + Math.sin(a) * 4);\n  const [r,g,b] = hsv(n * 45, 1, 1);\n  set(x, y, r, g, b);\n}");
        scripts.put("claude traffic light", "// Traffic signal\nconst phase = Math.floor(i / 8) % 3;\nset(6, 2, phase === 0 ? 255 : 50, 0, 0);\nset(6, 5, phase === 1 ? 255 : 50, phase === 1 ? 255 : 50, 0);\nset(6, 8, phase === 2 ? 0 : 20, phase === 2 ? 255 : 50, 0);");
        scripts.put("claude elevator", "// Elevator going up and down\nconst y = Math.abs((i % 20) - 10);\nrect(4, y, 4, 2, 200, 200, 200);\nset(5, y + 1, 100, 100, 100);\nset(6, y + 1, 100, 100, 100);");
        scripts.put("claude pendulum", "// Swinging pendulum\nconst angle = Math.sin(i / 3) * 4;\nconst x = Math.round(6 + angle);\nline(6, 0, x, 6, 150, 150, 150);\nset(x, 6, 200, 200, 0);\nset(x, 7, 200, 200, 0);");
        scripts.put("claude typing", "// Typing cursor\nconst chars = 'HELLO';\nconst pos = Math.floor(i / 6) % (chars.length + 3);\ntext(chars.substring(0, Math.min(pos, chars.length)), 1, 5, 255, 255, 255);\nif ((i % 12) < 6 && pos <= chars.length) set(1 + pos * 2, 5, 255, 255, 255);");
        scripts.put("claude portal", "// Portal vortex\nfor (let r = 0; r < 6; r++) {\n  const rr = 6 - r;\n  const offset = (i + r * 2) / 8;\n  for (let a = 0; a < Math.PI * 2; a += 0.4) {\n    const x = Math.round(5.5 + Math.cos(a + offset) * rr);\n    const y = Math.round(5.5 + Math.sin(a + offset) * rr);\n    const [rr2,g,b] = hsv((r * 60 + i * 10) % 360, 1, 1);\n    set(x, y, rr2, g, b);\n  }\n}");
        scripts.put("claude gauge", "// Fuel gauge\nconst level = i % 12;\nfor (let y = 0; y < level; y++) {\n  const color = y < 3 ? [255,0,0] : y < 7 ? [255,255,0] : [0,255,0];\n  rect(4, H - 1 - y, 4, 1, ...color);\n}");
        scripts.put("claude music notes", "// Floating music notes\nfor (let n = 0; n < 3; n++) {\n  const y = (H - 1 - ((i + n * 10) % H));\n  const x = 2 + n * 4;\n  set(x, y, 255, 100, 255);\n  set(x, y + 1, 255, 100, 255);\n  set(x + 1, y - 1, 255, 100, 255);\n}");
        scripts.put("claude battery", "// Battery charging\nconst level = (i / 2) % 8;\nrect(2, 4, 8, 4, 200, 200, 200);\nrect(10, 5, 1, 2, 200, 200, 200);\nfor (let x = 0; x < level; x++) {\n  rect(3 + x, 5, 1, 2, 0, 255, 0);\n}");
        scripts.put("claude wifi", "// WiFi signal bars\nconst strength = Math.floor(i / 6) % 5;\nfor (let n = 0; n < strength; n++) {\n  rect(4 + n, 8 - n * 2, 1, 2 + n * 2, 0, 200, 255);\n}");
        scripts.put("claude download", "// Download progress\nconst progress = i % W;\nrect(0, 5, progress, 2, 0, 255, 100);\nrect(progress, 5, W - progress, 2, 50, 50, 50);");
        scripts.put("claude sunrise", "// Sunrise effect\nconst sun_y = 10 - (i % 11);\nfor (let r = 0; r < 4; r++) {\n  for (let a = 0; a < Math.PI; a += 0.3) {\n    const x = Math.round(6 + Math.cos(a + Math.PI) * (r + 2));\n    const y = Math.round(sun_y + Math.sin(a + Math.PI) * (r + 2));\n    if (y >= 0) {\n      const v = 1 - r / 4;\n      set(x, y, 255, 200 * v, 50 * v);\n    }\n  }\n}");
        scripts.put("claude fish swim", "// Swimming fish\nconst x = (i % 16);\nconst y = 5 + Math.floor(Math.sin(i / 2) * 2);\nconst facing = x < 8;\nif (facing) {\n  set(x, y, 255, 150, 0);\n  set(x - 1, y, 255, 150, 0);\n  set(x - 1, y - 1, 100, 200, 255);\n  set(x - 1, y + 1, 100, 200, 255);\n} else {\n  set(15 - x, y, 255, 150, 0);\n  set(16 - x, y, 255, 150, 0);\n  set(16 - x, y - 1, 100, 200, 255);\n  set(16 - x, y + 1, 100, 200, 255);\n}");
        scripts.put("claude butterfly", "// Butterfly flapping\nconst flap = (i % 4) < 2;\nconst y = 5 + Math.floor(Math.sin(i / 2) * 2);\nset(6, y, 255, 0, 200);\nif (flap) {\n  set(5, y - 1, 255, 100, 200);\n  set(5, y + 1, 255, 100, 200);\n  set(7, y - 1, 255, 100, 200);\n  set(7, y + 1, 255, 100, 200);\n} else {\n  set(5, y, 255, 150, 200);\n  set(7, y, 255, 150, 200);\n}");
        scripts.put("claude rocket", "// Rocket launch (relaunches on a loop)\nconst y = Math.max(0, 10 - (i % 16));\nif (y > 0) {\n  rect(5, y, 2, 3, 200, 200, 200);\n  set(5, y, 255, 0, 0);\n  set(6, y, 255, 0, 0);\n  if (i % 2 === 0) {\n    set(5, y + 3, 255, 150, 0);\n    set(6, y + 3, 255, 150, 0);\n    set(5, y + 4, 255, 50, 0);\n    set(6, y + 4, 255, 50, 0);\n  }\n}");
        return scripts;
    }

    private String defaultCustomAnimation() {
        return "clear();\n" +
                "const x = i % W;\n" +
                "for (let y = 0; y < H; y++) set(x, y, 255, 80, 20);\n" +
                "set((W - 1) - x, Math.floor(H / 2), 60, 120, 255);";
    }

    private void saveCustomAnimation() {
        if (customAnimationEditor == null) return;
        getSharedPreferences(PREFS, MODE_PRIVATE)
                .edit()
                .putString(PREF_CUSTOM_ANIMATION, customAnimationEditor.getText().toString())
                .apply();
    }

    private void startCustomAnimation() {
        saveCustomAnimation();
        startScriptAnimation(customAnimationEditor == null ? "" : customAnimationEditor.getText().toString(), "Custom animation running");
    }

    private void stepCustomAnimation() {
        saveCustomAnimation();
        stepScriptAnimation(customAnimationEditor == null ? "" : customAnimationEditor.getText().toString());
    }

    private void startPcAnimation(Map<String, String> pcScripts) {
        String source = selectedPcAnimationSource(pcScripts);
        if (source.isEmpty()) return;
        startScriptAnimation(source, "PC animation running");
    }

    private void stepPcAnimation(Map<String, String> pcScripts) {
        String source = selectedPcAnimationSource(pcScripts);
        if (source.isEmpty()) return;
        stepScriptAnimation(source);
    }

    private void copyPcAnimationToCustom(Map<String, String> pcScripts) {
        String source = selectedPcAnimationSource(pcScripts);
        if (source.isEmpty() || customAnimationEditor == null) return;
        customAnimationEditor.setText(source);
        saveCustomAnimation();
        status.setText("Copied PC animation to custom editor");
    }

    private String selectedPcAnimationSource(Map<String, String> pcScripts) {
        if (pcAnimationSpinner == null || pcAnimationSpinner.getSelectedItem() == null) return "";
        String name = pcAnimationSpinner.getSelectedItem().toString();
        String source = pcScripts.get(name);
        return source == null ? "" : source;
    }

    private void startScriptAnimation(String source, String message) {
        animationRunning = false;
        customAnimationRunning = true;
        customAnimationFrame = 0;
        activeAnimationSource = source;
        status.setText(message);
        customAnimationTick.run();
    }

    private void stepScriptAnimation(String source) {
        animationRunning = false;
        customAnimationRunning = false;
        activeAnimationSource = source;
        renderCustomAnimationFrame(() -> status.setText("Script frame " + customAnimationFrame));
    }

    private void renderCustomAnimationFrame(Runnable after) {
        if (animationScriptView == null || customAnimationEditor == null) return;
        String source = activeAnimationSource;
        String script = buildCustomAnimationScript(source, customAnimationFrame);
        animationScriptView.evaluateJavascript(script, value -> {
            try {
                JSONObject result = new JSONObject(value);
                if (!result.optBoolean("ok", false)) {
                    customAnimationRunning = false;
                    status.setText("Custom error: " + result.optString("error", "script failed"));
                    return;
                }
                JSONArray out = result.getJSONArray("pixels");
                for (int idx = 0; idx < Math.min(CELL_COUNT, out.length()); idx++) {
                    JSONArray rgb = out.getJSONArray(idx);
                    pixels[idx] = Color.rgb(clampByte(rgb.optInt(0)), clampByte(rgb.optInt(1)), clampByte(rgb.optInt(2)));
                    selected[idx] = false;
                }
                renderGrid();
                sendPixels(false);
                customAnimationFrame++;
                if (after != null) after.run();
            } catch (Exception e) {
                customAnimationRunning = false;
                status.setText("Custom error: " + e.getMessage());
            }
        });
    }

    private int clampByte(int value) {
        return Math.max(0, Math.min(255, value));
    }

    private String buildCustomAnimationScript(String source, int frameNumber) {
        return "(function(){" +
                "const W=12,H=12,i=" + frameNumber + ",frame=i,t=i;" +
                "window.__lcdState=window.__lcdState||{};const state=window.__lcdState;" +
                "window.__lcdPrev=window.__lcdPrev||Array.from({length:144},()=>[0,0,0]);" +
                "const prev=window.__lcdPrev;const pixels=Array.from({length:144},()=>[0,0,0]);" +
                "function c(v){v=Number(v)||0;return Math.max(0,Math.min(255,Math.round(v)));}" +
                "function set(x,y,r,g,b){x=Math.round(x);y=Math.round(y);if(x<0||x>=W||y<0||y>=H)return;pixels[y*W+x]=[c(r),c(g),c(b)];}" +
                "function clear(r=0,g=0,b=0){for(let n=0;n<pixels.length;n++)pixels[n]=[c(r),c(g),c(b)];}" +
                "function rect(x,y,w,h,r,g,b){for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)set(x+xx,y+yy,r,g,b);}" +
                "function line(x0,y0,x1,y1,r,g,b){x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);let dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,e=dx+dy;for(;;){set(x0,y0,r,g,b);if(x0===x1&&y0===y1)break;let e2=2*e;if(e2>=dy){e+=dy;x0+=sx;}if(e2<=dx){e+=dx;y0+=sy;}}}" +
                "function hsv(h,s=1,v=1){h=((h%360)+360)%360;let f=(n,k=(n+h/60)%6)=>v-v*s*Math.max(Math.min(k,4-k,1),0);return [c(f(5)*255),c(f(3)*255),c(f(1)*255)];}" +
                "function fade(amount=0.75){for(let n=0;n<pixels.length;n++)pixels[n]=[c(prev[n][0]*amount),c(prev[n][1]*amount),c(prev[n][2]*amount)];}" +
                "function rand(max=1){return Math.random()*max;}" +
                "function text(pattern,x,y,r,g,b){String(pattern).split('|').forEach((row,yy)=>{[...row].forEach((ch,xx)=>{if(ch!=='0'&&ch!=='.'&&ch!==' ')set(x+xx,y+yy,r,g,b);});});}" +
                "try{const source=" + JSONObject.quote(source) + ";" +
                "new Function('W','H','i','frame','clear','set','rect','line','hsv','text','state','fade','rand','pixels','const t=i;'+source)(W,H,i,frame,clear,set,rect,line,hsv,text,state,fade,rand,pixels);" +
                "window.__lcdPrev=pixels.map(p=>p.slice());return {ok:true,pixels:pixels};" +
                "}catch(e){return {ok:false,error:String(e&&e.message?e.message:e)};}" +
                "})()";
    }

    private void startAnimation(int mode) {
        animationRunning = false;
        customAnimationRunning = false;
        animationMode = mode;
        animationStep = 0;
        animationRunning = true;
        animationTick.run();
    }

    private void renderAnimationFrame(int mode, int t) {
        Arrays.fill(pixels, Color.BLACK);
        if (mode == 0) {
            for (int i = 0; i <= t % CELL_COUNT; i++) pixels[i] = scaledColor(selectedColor);
        } else if (mode == 1) {
            int v = 30 + (int)(Math.abs(Math.sin(t * 0.25)) * 225);
            for (int i = 0; i < CELL_COUNT; i++) pixels[i] = Color.rgb(v, 0, 255 - v);
        } else if (mode == 2) {
            for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
                float hue = ((x * 30 + y * 10 + t * 8) % 360);
                pixels[y * W + x] = Color.HSVToColor(new float[]{hue, 1.0f, brightness / 255f});
            }
        } else if (mode == 3) {
            renderHeart(t);
        } else if (mode == 4) {
            for (int i = 0; i < 18; i++) {
                int index = Math.abs((t * 17 + i * 41) % CELL_COUNT);
                pixels[index] = Color.WHITE;
            }
        } else if (mode == 5) {
            int x = t % (W * 2 - 2);
            if (x >= W) x = W * 2 - 2 - x;
            for (int y = 0; y < H; y++) pixels[y * W + x] = scaledColor(selectedColor);
        } else if (mode == 6) {
            renderTetris(t);
        } else if (mode == 7) {
            renderSnake(t);
        } else if (mode == 8) {
            renderComet(t);
        }
    }

    private void changeAnimationSpeed(int delta) {
        animationDelayMs = Math.max(60, Math.min(1000, animationDelayMs + delta));
        status.setText("Animation speed " + animationDelayMs + " ms");
    }

    private void stopAnimation() {
        animationRunning = false;
        customAnimationRunning = false;
        status.setText("Animation stopped");
    }

    private void renderHeart(int t) {
        int pulse = 105 + (int)(Math.abs(Math.sin(t * 0.35)) * 150);
        int color = Color.rgb(pulse, 0, Math.max(25, pulse / 5));
        int[][] coords = {
                {3,2},{4,2},{7,2},{8,2},
                {2,3},{3,3},{4,3},{5,3},{6,3},{7,3},{8,3},{9,3},
                {2,4},{3,4},{4,4},{5,4},{6,4},{7,4},{8,4},{9,4},
                {3,5},{4,5},{5,5},{6,5},{7,5},{8,5},
                {4,6},{5,6},{6,6},{7,6},
                {5,7},{6,7},
                {5,8},{6,8}
        };
        for (int[] xy : coords) pixels[xy[1] * W + xy[0]] = color;
    }

    private void renderTetris(int t) {
        int[][] board = {
                {0,0,0,0,0,0,0,0,0,0,0,0},
                {0,0,0,0,0,0,0,0,0,0,0,0},
                {0,0,0,0,0,0,0,0,0,0,0,0},
                {0,0,0,0,0,0,0,0,0,0,0,0},
                {0,0,0,0,0,0,0,0,0,0,0,0},
                {0,0,0,0,0,0,0,0,0,0,0,0},
                {0,0,0,0,0,0,0,0,0,0,0,0},
                {0,0,0,0,0,0,0,0,0,0,0,0},
                {3,3,0,2,2,2,0,6,6,0,4,0},
                {3,0,0,0,2,0,0,0,6,6,4,0},
                {1,1,1,5,5,0,7,7,7,4,4,0},
                {1,0,0,5,5,0,0,7,0,0,4,0}
        };
        int[] palette = {Color.BLACK, Color.CYAN, Color.rgb(250, 214, 60), Color.rgb(233, 84, 96), Color.rgb(82, 199, 93), Color.rgb(147, 99, 230), Color.rgb(255, 146, 43), Color.rgb(62, 132, 235)};
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) pixels[y * W + x] = dim(palette[board[y][x]], 0.80f);
        int drop = t % 9;
        int shift = (t / 9) % 4;
        int color = Color.HSVToColor(new float[]{(t * 24) % 360, 0.85f, brightness / 255f});
        int baseX = 4 + (shift == 1 ? 1 : shift == 2 ? 2 : 0);
        setPixelSafe(baseX, drop, color);
        setPixelSafe(baseX + 1, drop, color);
        setPixelSafe(baseX, drop + 1, color);
        setPixelSafe(baseX + 1, drop + 1, color);
    }

    private void renderSnake(int t) {
        int[][] path = {
                {1,1},{2,1},{3,1},{4,1},{5,1},{6,1},{7,1},{8,1},{9,1},{10,1},
                {10,2},{10,3},{9,3},{8,3},{7,3},{6,3},{5,3},{4,3},{3,3},{2,3},{1,3},
                {1,4},{1,5},{2,5},{3,5},{4,5},{5,5},{6,5},{7,5},{8,5},{9,5},{10,5},
                {10,6},{10,7},{9,7},{8,7},{7,7},{6,7},{5,7},{4,7},{3,7},{2,7},{1,7},
                {1,8},{1,9},{2,9},{3,9},{4,9},{5,9},{6,9},{7,9},{8,9},{9,9},{10,9}
        };
        int appleIndex = (t / 15) % path.length;
        int[] apple = path[appleIndex];
        setPixelSafe(apple[0], apple[1], Color.rgb(230, 45, 45));
        for (int i = 0; i < 12; i++) {
            int pos = (t + path.length - i) % path.length;
            int[] xy = path[pos];
            int green = Math.max(55, 240 - i * 14);
            setPixelSafe(xy[0], xy[1], Color.rgb(25, green, 65));
        }
    }

    private void renderComet(int t) {
        int cx = t % W;
        int cy = (t / 2) % H;
        for (int i = 0; i < 12; i++) {
            int x = cx - i;
            int y = cy - i / 3;
            if (x < 0) x += W;
            if (y < 0) y += H;
            float value = Math.max(0.08f, (12 - i) / 12f) * brightness / 255f;
            setPixelSafe(x, y, Color.HSVToColor(new float[]{(t * 9 + i * 12) % 360, 0.95f, value}));
        }
    }

    private int dim(int color, float factor) {
        return Color.rgb((int)(Color.red(color) * factor), (int)(Color.green(color) * factor), (int)(Color.blue(color) * factor));
    }

    private void setPixelSafe(int x, int y, int color) {
        if (x >= 0 && y >= 0 && x < W && y < H) pixels[y * W + x] = color;
    }

    private void toast(String message) {
        Toast.makeText(this, message == null ? "Error" : message, Toast.LENGTH_SHORT).show();
    }
}
