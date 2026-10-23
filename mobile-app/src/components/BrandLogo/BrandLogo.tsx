import { Image, type ImageStyle, type StyleProp } from "react-native";

type BrandLogoProps = {
  className?: string;
  style?: StyleProp<ImageStyle>;
};

export default function BrandLogo({ className, style }: BrandLogoProps) {
  return (
    <Image
      accessibilityLabel="WindWorld - Clean Energy Forever"
      className={className}
      resizeMode="contain"
      source={require("../../../assets/logo.png")}
      style={style}
    />
  );
}
