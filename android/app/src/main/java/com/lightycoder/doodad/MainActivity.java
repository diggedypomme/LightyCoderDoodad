package com.lightycoder.doodad;

import android.Manifest;
import android.app.Activity;
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
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.GridLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.InputStream;
import java.util.Arrays;
import java.util.Locale;

public class MainActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private BluetoothAdapter adapter;
    private BluetoothLeScanner scanner;
    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic commandChar;
    private TextView status;
    private LinearLayout content;
    private final int[] pixels = new int[144];
    private final boolean[] selected = new boolean[144];
    private final Button[] cells = new Button[144];
    private int selectedColor = Color.RED;
    private int brightness = 255;
    private boolean multiSelect = true;
    private boolean paintStarted = false;
    private int animationStep = 0;
    private boolean animationRunning = false;
    private final Runnable animationTick = new Runnable() {
        @Override public void run() {
            if (!animationRunning) return;
            renderAnimationFrame(animationStep++);
            sendPixels(false);
            main.postDelayed(this, 300);
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Arrays.fill(pixels, Color.BLACK);
        BluetoothManager manager = getSystemService(BluetoothManager.class);
        adapter = manager == null ? null : manager.getAdapter();
        scanner = adapter == null ? null : adapter.getBluetoothLeScanner();
        requestBlePermissions();
        buildShell();
        showPadPage();
    }

    private void buildShell() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(18, 18, 18, 18);

        status = new TextView(this);
        status.setText("Disconnected");
        status.setTextSize(16);
        root.addView(status);

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(0, 12, 0, 12);
        addButton(top, "Connect", v -> scanAndConnect(), 1);
        addButton(top, "Start Paint", v -> startPaint(), 1);
        addButton(top, "Disconnect", v -> disconnect(), 1);
        root.addView(top);

        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        addButton(nav, "Pad", v -> showPadPage(), 1);
        addButton(nav, "Images", v -> showImagesPage(), 1);
        addButton(nav, "Animations", v -> showAnimationsPage(), 1);
        root.addView(nav);

        ScrollView scroll = new ScrollView(this);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(0, 12, 0, 0);
        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
    }

    private Button addButton(LinearLayout parent, String label, View.OnClickListener listener, int weight) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setOnClickListener(listener);
        parent.addView(button, new LinearLayout.LayoutParams(0, -2, weight));
        return button;
    }

    private void showPadPage() {
        animationRunning = false;
        content.removeAllViews();
        content.addView(label("12x12 Pad"));
        addColorControls(content);

        CheckBox multi = new CheckBox(this);
        multi.setText("Select multiple cells");
        multi.setChecked(multiSelect);
        multi.setOnCheckedChangeListener((buttonView, isChecked) -> multiSelect = isChecked);
        content.addView(multi);

        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(12);
        for (int i = 0; i < 144; i++) {
            final int index = i;
            Button cell = new Button(this);
            cell.setText((i % 12) + "," + (i / 12));
            cell.setTextSize(8);
            cell.setPadding(0, 0, 0, 0);
            cell.setOnClickListener(v -> toggleCell(index));
            cells[i] = cell;
            grid.addView(cell, new ViewGroupLayout(64, 64));
        }
        content.addView(grid);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        addButton(row, "Apply Colour", v -> applyColourToSelection(), 1);
        addButton(row, "Clear Selected", v -> clearSelection(), 1);
        addButton(row, "Clear All", v -> clearAllPixels(), 1);
        content.addView(row);

        LinearLayout sendRow = new LinearLayout(this);
        sendRow.setOrientation(LinearLayout.HORIZONTAL);
        addButton(sendRow, "Send", v -> sendPixels(true), 1);
        addButton(sendRow, "Send + Start Paint", v -> { startPaint(); main.postDelayed(() -> sendPixels(false), 1300); }, 1);
        content.addView(sendRow);
        renderGrid();
    }

    private void showImagesPage() {
        animationRunning = false;
        content.removeAllViews();
        content.addView(label("Images"));
        content.addView(text("Load an image, centre-crop it to a square, downsample to 12x12, then send it to paint mode."));
        addButton(content, "Load Image", v -> pickImage(), 1);
        addColorControls(content);
        addButton(content, "Send Current Image/Grid", v -> sendPixels(true), 1);
        ImageView preview = new ImageView(this);
        preview.setImageBitmap(bitmapFromPixels());
        preview.setAdjustViewBounds(true);
        content.addView(preview, new LinearLayout.LayoutParams(-1, 480));
    }

    private void showAnimationsPage() {
        content.removeAllViews();
        content.addView(label("Animations"));
        content.addView(text("These are generated on the phone and streamed as compact canvas frames."));
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        addButton(row, "Play Wipe", v -> startAnimation(0), 1);
        addButton(row, "Play Pulse", v -> startAnimation(1), 1);
        addButton(row, "Play Rainbow", v -> startAnimation(2), 1);
        content.addView(row);
        addButton(content, "Stop", v -> animationRunning = false, 1);
    }

    private void addColorControls(LinearLayout parent) {
        LinearLayout colours = new LinearLayout(this);
        colours.setOrientation(LinearLayout.HORIZONTAL);
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
        Button button = addButton(parent, label, v -> selectedColor = color, 1);
        button.setBackgroundColor(color);
        button.setTextColor((Color.red(color) + Color.green(color) + Color.blue(color)) < 380 ? Color.WHITE : Color.BLACK);
    }

    private TextView label(String text) {
        TextView view = text(text);
        view.setTextSize(22);
        view.setPadding(0, 16, 0, 8);
        return view;
    }

    private TextView text(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setPadding(0, 6, 0, 6);
        return view;
    }

    private void toggleCell(int index) {
        if (!multiSelect) Arrays.fill(selected, false);
        selected[index] = !selected[index];
        renderGrid();
    }

    private void applyColourToSelection() {
        int color = scaledColor(selectedColor);
        for (int i = 0; i < 144; i++) if (selected[i]) pixels[i] = color;
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
            cells[i].setBackgroundColor(selected[i] ? lighten(pixels[i]) : pixels[i]);
            cells[i].setTextColor((Color.red(pixels[i]) + Color.green(pixels[i]) + Color.blue(pixels[i])) < 380 ? Color.WHITE : Color.BLACK);
        }
    }

    private int lighten(int color) {
        return Color.rgb(Math.min(255, Color.red(color) + 60), Math.min(255, Color.green(color) + 60), Math.min(255, Color.blue(color) + 60));
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

    private void scanAndConnect() {
        if (!hasBlePermission()) { requestBlePermissions(); return; }
        if (adapter == null || !adapter.isEnabled()) {
            startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS));
            return;
        }
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) { toast("No BLE scanner"); return; }
        status.setText("Scanning...");
        scanner.startScan(scanCallback);
        main.postDelayed(() -> {
            try { scanner.stopScan(scanCallback); } catch (Exception ignored) {}
            if (gatt == null) status.setText("No Arcade Coder found");
        }, 8000);
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
            try { scanner.stopScan(this); } catch (Exception ignored) {}
            status.setText("Connecting " + (name.isEmpty() ? device.getAddress() : name));
            gatt = device.connectGatt(MainActivity.this, false, gattCallback);
        }
    };

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override public void onConnectionStateChange(BluetoothGatt g, int statusCode, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                g.requestMtu(517);
                g.discoverServices();
                main.post(() -> status.setText("Connected"));
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                commandChar = null;
                paintStarted = false;
                main.post(() -> status.setText("Disconnected"));
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
        if (gatt != null) {
            gatt.disconnect();
            gatt.close();
        }
        gatt = null;
        commandChar = null;
        paintStarted = false;
        status.setText("Disconnected");
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

    private void pickImage() {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.setType("image/*");
        startActivityForResult(Intent.createChooser(intent, "Choose image"), 20);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != 20 || resultCode != RESULT_OK || data == null) return;
        try {
            Uri uri = data.getData();
            InputStream stream = getContentResolver().openInputStream(uri);
            Bitmap bitmap = BitmapFactory.decodeStream(stream);
            if (bitmap != null) loadBitmapToPixels(bitmap);
            showImagesPage();
        } catch (Exception e) {
            toast(e.getMessage());
        }
    }

    private void loadBitmapToPixels(Bitmap bitmap) {
        int size = Math.min(bitmap.getWidth(), bitmap.getHeight());
        int left = (bitmap.getWidth() - size) / 2;
        int top = (bitmap.getHeight() - size) / 2;
        Bitmap crop = Bitmap.createBitmap(bitmap, left, top, size, size);
        Bitmap small = Bitmap.createScaledBitmap(crop, 12, 12, true);
        for (int y = 0; y < 12; y++) {
            for (int x = 0; x < 12; x++) {
                int c = small.getPixel(x, y);
                pixels[y * 12 + x] = Color.rgb(Color.red(c) * brightness / 255, Color.green(c) * brightness / 255, Color.blue(c) * brightness / 255);
            }
        }
    }

    private Bitmap bitmapFromPixels() {
        Bitmap bitmap = Bitmap.createBitmap(12, 12, Bitmap.Config.ARGB_8888);
        for (int y = 0; y < 12; y++) for (int x = 0; x < 12; x++) bitmap.setPixel(x, y, pixels[y * 12 + x]);
        return Bitmap.createScaledBitmap(bitmap, 360, 360, false);
    }

    private void startAnimation(int mode) {
        animationRunning = false;
        animationStep = mode * 1000;
        animationRunning = true;
        animationTick.run();
    }

    private void renderAnimationFrame(int step) {
        int mode = step / 1000;
        int t = step % 1000;
        Arrays.fill(pixels, Color.BLACK);
        if (mode == 0) {
            for (int i = 0; i <= t % 144; i++) pixels[i] = scaledColor(selectedColor);
        } else if (mode == 1) {
            int v = 40 + (int)(Math.abs(Math.sin(t * 0.25)) * 215);
            for (int i = 0; i < 144; i++) pixels[i] = Color.rgb(v, 0, 255 - v);
        } else {
            for (int y = 0; y < 12; y++) {
                for (int x = 0; x < 12; x++) {
                    float hue = ((x * 30 + y * 10 + t * 8) % 360);
                    pixels[y * 12 + x] = Color.HSVToColor(new float[]{hue, 1.0f, brightness / 255f});
                }
            }
        }
    }

    private void toast(String message) {
        Toast.makeText(this, message == null ? "Error" : message, Toast.LENGTH_SHORT).show();
    }

    private static class ViewGroupLayout extends ViewGroup.LayoutParams {
        ViewGroupLayout(int w, int h) { super(w, h); }
    }
}