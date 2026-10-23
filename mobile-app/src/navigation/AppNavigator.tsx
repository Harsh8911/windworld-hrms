import { createNativeStackNavigator } from "@react-navigation/native-stack";

import AdminDashboardScreen from "../screens/admin/AdminDashboardScreen/AdminDashboardScreen";
import EmployeeDashboardScreen from "../screens/employee/EmployeeDashboardScreen/EmployeeDashboardScreen";
import LoginScreen from "../screens/LoginScreen/LoginScreen";
import SplashScreen from "../screens/SplashScreen/SplashScreen";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen
        name="EmployeeDashboard"
        component={EmployeeDashboardScreen}
      />
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
    </Stack.Navigator>
  );
}
