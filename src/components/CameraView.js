import React, { forwardRef, memo } from 'react';
import { CameraView as ExpoCameraView } from 'expo-camera';
import { StyleSheet } from 'react-native';

const CameraView = memo(
  forwardRef(function CameraView({ onCameraReady }, ref) {
    return (
      <ExpoCameraView
        ref={ref}
        style={StyleSheet.absoluteFill}
        facing="back"
        autofocus="on"
        animateShutter={false}
        onCameraReady={onCameraReady}
      />
    );
  })
);

export default CameraView;
