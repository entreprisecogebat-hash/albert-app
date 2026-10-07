import { Redirect } from 'expo-router';

/** Place du bouton « Ajouter » dans la barre d'onglets ; l'écran lui-même est la feuille /ajouter. */
export default function PlusTab() {
  return <Redirect href="/ajouter" />;
}
